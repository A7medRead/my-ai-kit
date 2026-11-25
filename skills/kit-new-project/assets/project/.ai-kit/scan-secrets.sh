#!/bin/sh
# Blocks commits and pushes that contain likely secrets.
# It reports file and line only, never the secret value.
# This is a pattern check: it reduces risk but cannot catch every secret.
#
# Usage: scan-secrets.sh --staged | --all | --range A..B | --pre-push [remote]
# Allow a false positive (only with the owner's approval):
#   - put "ai-kit:allow-secret" in a comment on that line, or
#   - add the exact file path to .ai-kit/secrets-allow (for blocked file names)

set -u

# Byte-wise matching: BSD tools (macOS) stop on non-UTF-8 content otherwise.
export LC_ALL=C

root=$(git rev-parse --show-toplevel) || { echo "secret scan: not a git repository" >&2; exit 2; }
cd "$root" || exit 2

tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT
: > "$tmp/hits"
: > "$tmp/err"
: > "$tmp/patterns"
scanned=0
tab=$(printf '\t')

g() { git -c core.quotepath=false --literal-pathspecs "$@"; }

fail() { echo "secret scan: could not complete: $1" >&2; exit 2; }

# The only list of content rules. Calls: <callback> <rule-name> <case: i or empty> <pattern>
each_rule() {
    "$1" private-key "" '-----BEGIN [A-Z ]*PRIVATE KEY-----'
    "$1" aws-access-key "" '(AKIA|ASIA)[0-9A-Z]{16}'
    "$1" github-token "" 'gh[pousr]_[A-Za-z0-9]{36}'
    "$1" github-token "" 'github_pat_[A-Za-z0-9_]{60}'
    "$1" slack-token "" 'xox[abprs]-[A-Za-z0-9-]{20}'
    "$1" google-api-key "" 'AIza[0-9A-Za-z_-]{35}'
    "$1" ai-api-key "" '(^|[^A-Za-z0-9_-])sk-(proj-|ant-|or-)?[A-Za-z0-9_-]{32}'
    "$1" stripe-live-key "" '(sk|rk)_live_[0-9A-Za-z]{20}'
    # Includes the host, so that only the real host decides whether the URL is local.
    "$1" database-url-with-password i \
        '(postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|rediss|amqp|amqps)://[^:@/[:space:]]*:[^@/[:space:]]+@[][A-Za-z0-9._:-]*'
    "$1" hardcoded-credential i \
        "(api[_-]?key|secret|token|password|passwd)[A-Za-z0-9_]*[\"']?[[:space:]]*[:=][[:space:]]*[\"'][^\"'[:space:]]{12,}[\"']"
}

collect_pattern() { printf '%s\n' "$3" >> "$tmp/patterns"; }
each_rule collect_pattern

# Reads "name<TAB>line<TAB>matched text" and records hits. Placeholder exceptions look only
# at the matched text, so other words on the same line cannot hide a secret.
report() {
    RULE=$1 ALLOW="$tmp/allowed" awk '
        BEGIN {
            FS = "\t"
            while ((getline entry < ENVIRON["ALLOW"]) > 0) allowed[entry] = 1
            rule = ENVIRON["RULE"]
        }
        {
            if (($1 FS $2) in allowed) next
            value = $0
            sub(/^[^\t]*\t[^\t]*\t/, "", value)
            original = value
            value = tolower(value)
            if (rule == "database-url-with-password") {
                if (value ~ /@(localhost|127[.]0[.]0[.]1|\[::1\])(:[0-9]*)?$/) next
                if (value ~ /:\/\/[^@]*([$][{]|<)[^@]*@/) next
            }
            if (rule == "hardcoded-credential") {
                # A whole value such as env(OPENAI_API_KEY) names a variable and holds no secret.
                reference = original
                sub(/["\047]$/, "", reference)
                sub(/^.*["\047]/, "", reference)
                if (reference ~ /^env[(][A-Z][A-Z0-9_]*[)]$/) next
                sub(/["\047]$/, "", value)
                sub(/^.*["\047]/, "", value)
                if (value ~ /example|changeme|change-me|your[_-]|placeholder|dummy|xxxx|[$][{]|<[a-z_ -]+>/) next
            }
            print $1 ":" $2 "  [" rule "]"
        }
    ' >> "$tmp/hits" 2>> "$tmp/err"
}

# grep_tree <tree> <file-list> <flags> <pattern>   output fields are NUL separated
grep_tree() {
    # xargs returns non-zero when nothing matches, so errors are detected through stderr.
    tr '\n' '\0' < "$2" |
        xargs -0 sh -c '
            tree=$1; flags=$2; pattern=$3; shift 3
            git -c core.quotepath=false --literal-pathspecs grep --no-textconv "$flags" -e "$pattern" "$tree" -- "$@"
            status=$?
            [ "$status" -le 1 ] || echo "git grep failed with status $status" >&2
        ' sh "$1" "$3" "$4" 2>> "$tmp/err"
}

# -a reads every file as text, including files git would treat as binary.
search_tree() {
    grep_tree "$tree" "$list" "-nzoaE$2" "$3" | tr '\000' '\t' | report "$1"
}

search_blob() {
    grep "-noaE$2" -e "$3" "$tmp/text" 2>> "$tmp/err" |
        LABEL="$label" awk '{
            colon = index($0, ":")
            print ENVIRON["LABEL"] "\t" substr($0, 1, colon - 1) "\t" substr($0, colon + 1)
        }' | report "$1"
}

# Binary-looking files are also checked with NUL bytes removed, which exposes UTF-16 text.
scan_binary_files() {
    grep_tree "$tree" "$list" -Ilz '' | tr '\000' '\n' | sed "s/^$tree://" > "$tmp/textfiles"
    grep -vxF -f "$tmp/textfiles" "$list" > "$tmp/binary"
    while IFS= read -r file; do
        if [ "$tree" = --cached ]; then spec=":0:$file"; label=$file
        else spec="$tree:$file"; label="$tree:$file"; fi
        if ! git cat-file blob "$spec" > "$tmp/blob" 2>/dev/null; then
            if [ "$tree" = --cached ]; then entry=$(g ls-files -s -- "$file")
            else entry=$(g ls-tree "$tree" -- "$file"); fi
            case "$entry" in
                160000*) continue ;; # submodule: no content in this repository
                *) echo "cannot read $file" >> "$tmp/err"; continue ;;
            esac
        fi
        tr -d '\000' < "$tmp/blob" > "$tmp/text"
        grep -qiaE -f "$tmp/patterns" "$tmp/text" || continue
        each_rule search_blob
    done < "$tmp/binary"
}

# scan_set <tree> <file-list>   tree is "--cached" or a commit id
scan_set() {
    tree=$1
    list=$2
    [ -s "$list" ] || return 0
    while IFS= read -r file; do
        scanned=$((scanned + 1))
        case "${file##*/}" in
            .env.example|.env.sample|.env.template) ;;
            .env|.env.*|*.pem|*.p12|*.pfx|*.keystore|*.jks|id_rsa|id_ed25519)
                if ! { [ -f .ai-kit/secrets-allow ] && tr -d '\r' < .ai-kit/secrets-allow | grep -qxF -- "$file"; }; then
                    echo "$file  [blocked-file-name]" >> "$tmp/hits"
                fi ;;
        esac
    done < "$list"

    # Lines whose content carries the allow marker inside a comment.
    grep_tree "$tree" "$list" -nzaE '(//|#|/[*]|<!--|--|;)[[:space:]]*ai-kit:allow-secret' |
        tr '\000' '\t' | cut -d "$tab" -f 1,2 > "$tmp/allowed"

    each_rule search_tree
    scan_binary_files
}

scan_commits() {
    # $1: file containing commit ids
    while IFS= read -r commit; do
        g diff-tree --no-commit-id --name-only -r --root -m --diff-filter=ACMRT "$commit" > "$tmp/raw" ||
            fail "cannot list files of $commit"
        sort -u "$tmp/raw" > "$tmp/files"
        scan_set "$commit" "$tmp/files"
    done < "$1"
}

case "${1:-}" in
    --staged)
        g diff --cached --name-only --diff-filter=ACMRT > "$tmp/files" || fail "cannot list staged files"
        scan_set --cached "$tmp/files"
        ;;
    --all)
        g ls-files > "$tmp/files" || fail "cannot list files"
        scan_set --cached "$tmp/files"
        ;;
    --range)
        [ -n "${2:-}" ] || fail "missing range"
        git rev-list "$2" > "$tmp/commits" || fail "invalid range $2"
        scan_commits "$tmp/commits"
        ;;
    --pre-push)
        # Only commits already on the destination remote may be skipped. Without a known
        # remote name (for example a bare URL) the whole history is scanned.
        remote=${2:-}
        while read -r _local_ref local_sha _remote_ref remote_sha; do
            case "$local_sha" in *[!0]*) ;; *) continue ;; esac
            known=no
            case "$remote_sha" in
                *[!0]*) git cat-file -e "$remote_sha^{commit}" 2>/dev/null && known=yes ;;
            esac
            if [ "$known" = yes ]; then
                git rev-list "$remote_sha..$local_sha" > "$tmp/commits" || fail "cannot list commits"
            elif [ -n "$remote" ] && git config --get "remote.$remote.url" >/dev/null; then
                git rev-list "$local_sha" --not "--remotes=$remote" > "$tmp/commits" || fail "cannot list commits"
            else
                git rev-list "$local_sha" > "$tmp/commits" || fail "cannot list commits"
            fi
            scan_commits "$tmp/commits"
        done
        ;;
    *)
        echo "usage: scan-secrets.sh --staged | --all | --range A..B | --pre-push [remote]" >&2
        exit 2
        ;;
esac

if [ -s "$tmp/err" ]; then
    cat "$tmp/err" >&2
    fail "search errors"
fi

if [ -s "$tmp/hits" ]; then
    echo "BLOCKED: possible secrets found" >&2
    sort -u "$tmp/hits" >&2
    echo "Remove the value. If it was ever pushed or shared, rotate it." >&2
    exit 1
fi

echo "secret scan: clean ($scanned file entries checked)"
