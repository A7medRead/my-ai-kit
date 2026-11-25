# my-ai-kit

قواعد و skills موحدة لـ Claude Code و Codex و Gemini CLI / Antigravity و GitHub Copilot.
الإصدار: شوف ملف `VERSION`.

## المحتوى
| المكان | بيعمل إيه |
|---|---|
| `AGENTS.md` | القواعد الأساسية، بتتقري دايماً |
| `skills/` | 10 مهارات بتتقري وقت الحاجة، وكل اسم بيبدأ بـ `kit-` عشان ميتعارضش مع مهارات تانية |
| `taste/` | مكتبة ذوقك الخاصة، بتتعمل عندك ومبتترفعش مع الـ kit |
| `skills/kit-new-project/assets/project/` | قوالب ملفات المشروع وفحص الأسرار والـ hooks وملف GitHub Actions |
| `design-history.md` | التصميمات المعتمدة عشان متتكررش |
| `install.mjs` | ربط الـ kit بالأدوات |
| `tests/` | سيناريوهات اختبار الالتزام، واختبار آلي للـ scripts |
| `.github/workflows/test.yml` | يشغل الاختبار الآلي على Mac و Windows و Linux لما الـ kit يترفع على GitHub |

القواعد والـ skills مكتوبة بالإنجليزي (أوفر في الليمت)، وفيها قاعدة إن الـ AI يرد بلغتك.

## المطلوب على الجهاز
- **Git** و **Node 18 أو أحدث**، على Mac أو Windows أو Linux. الأوامر هي هي على كل الأنظمة.
- للتأكد: `node --version` و `git --version`.

## قبل ما تركب
القواعد دي بتتطبق على **كل مشاريعك**، ومنها إن الـ AI يعمل **commit و push أوتوماتيك** على branch غير `main` بعد ما الفحوصات تنجح. اقرا `AGENTS.md` وعدل اللي ميناسبكش قبل التركيب.

## التركيب
**1. نزل الـ kit في مكان دايم**، لأن مساره بيتكتب في ملفات الأدوات. لو نقلته بعدين، شغّل التركيب تاني.

```bash
git clone https://github.com/A7medRead/my-ai-kit.git
cd my-ai-kit
```

**2. شوف هيتغير إيه** (مش بيعدل حاجة):

```bash
node install.mjs
```

**3. نفذ:**

```bash
node install.mjs --apply
```

- لأداة معينة: أضف `--tools claude,codex`.
- للإزالة: أضف `--uninstall --apply`.
- كلامك القديم في ملفات الأدوات بيفضل، والـ kit بيعدل الجزء بتاعه بس بين علامتين، وبياخد backup قبل أي تعديل.

**4. افتح جلسة جديدة** في كل أداة.

## Mac و Windows مع بعض
اعمل `git clone` على كل جهاز، وشغّل `node install.mjs --apply` عليه. وبعد أي تعديل: `git pull` ثم التركيب تاني. و `design-history.md` بيتنقل بين الأجهزة عن طريق git برضه، فلو الـ repository عام يبقى أي حاجة ترفعها فيه ظاهرة للناس. ولو هتعدل لنفسك، اعمل **fork** أو نسخة خاصة بيك.

## بيتحط فين
`~` معناها فولدر المستخدم: `/Users/<name>` على Mac، و `C:\Users\<name>` على Windows.

| الأداة | القواعد | الـ skills |
|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | `~/.claude/skills` |
| Codex | `~/.codex/AGENTS.md` | `~/.agents/skills` |
| Gemini CLI | `~/.gemini/GEMINI.md` | `~/.agents/skills` |
| Antigravity | `~/.gemini/GEMINI.md` | `~/.gemini/config/skills` |
| Copilot CLI | `~/.copilot/copilot-instructions.md` | `~/.agents/skills` |

المسارات دي اتراجعت على الـ docs الرسمية يوم 2026-11-25، وممكن تتغير مع التحديثات.

**ملاحظات:**
- حسب [إعلان Google](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli)، Gemini CLI وقف من 18 يونيو 2026 للحسابات المجانية و Pro و Ultra، وبديله Antigravity CLI. ولسه متاح لتراخيص المؤسسات ومفاتيح API المدفوعة.
- **Copilot في VS Code:** بيقرا ملفات مختلفة حسب نوع الـ agent المختار. اتأكد إنه شايف القواعد بإنك تسأله «إيه القواعد اللي ماشي عليها؟». ولو شافها مرتين أو مشافهاش، راجع [صفحة التعليمات](https://code.visualstudio.com/docs/agent-customization/custom-instructions).

## في أي مشروع
قول للـ AI: **«ابدأ المشروع بـ kit-new-project»**. أو جهز الملفات بنفسك:

```bash
node skills/kit-new-project/scripts/setup-project.mjs "path/to/project" --include design
```

**مهم:** لما تعمل clone للمشروع على جهاز تاني، شغّل الأمر ده تاني هناك، لأن تفعيل الـ hooks مبيتنقلش مع git.

بعدها املأ `.ai-kit/checks.sh` بأوامر المشروع. لحد ما يتملي، الفحص على GitHub **هيفشل عن قصد** بدل ما ينجح من غير ما يفحص حاجة. ودقايق GitHub Actions في الـ repos الخاصة ليها حدود.

## مكتبة ذوقك
جهزها مرة واحدة من فولدر الـ kit:

```bash
node skills/kit-taste/scripts/init-taste.mjs .
```

وبعدين قول لأي أداة:

> ضيف ده لذوقي: (رابط أو صورة). عاجبني فيه كذا، ومش عاجبني كذا.

- `taste/` فيه `principles.md` (خلاصة ذوقك) و `index.md` (سطر لكل مثال) و `items/` (الملاحظات والصور).
- الأداة بتقرا الملخص بس، وتفتح الأمثلة القريبة من المشروع.
- **خاصة:** الـ kit بيتجاهلها، وليها git repository لوحدها من غير remote. لو عايزها على Mac كمان، ارفعها على repository **private** واعمل لها `git clone` جوه فولدر الـ kit باسم `taste`.

## فحص التصميم
```bash
node skills/kit-design/scripts/design-check.mjs path/to/page.html --out shots
```

- بيفتح الصفحة على مقاس موبايل و Tablet وكمبيوتر، ويقيس: التباين، الخروج عن العرض، حجم الأزرار، الزرار المقفول اللي شكله شغال، الخط فوق الصفر العربي، الصور والحقول من غير وصف، و RTL، وأخطاء JavaScript، والملفات والصور اللي مبتحملش. وبياخد screenshots.
- لفحص الألوان المكتوبة برا ملف الألوان: `--source src --tokens src/styles/tokens.css` (بيلقط hex والألوان بالاسم وصيغ CSS الحديثة وألوان Tailwind). دا بحث في النص، فمش هيشوف لون بيتركب وقت التشغيل.
- محتاج **Node 22 أو أحدث** ومتصفح Chrome أو Edge أو Chromium. ولو مقدرش يشتغل بيقول إن الفحص **متعملش**.
- بيقيس الحالة اللي بتظهر أول ما الصفحة تفتح (أو بعد `--before`). والذوق والتوزيع محتاجين عين.

## التعديل والتحديث
عدّل هنا في الـ kit بس، وبعدين شغّل `node install.mjs --apply` تاني. ولو عدلت نسخة متركبة بإيدك، الـ script مش هيمسحها من غير `--force`.

## حدود لازم تعرفها
- القواعد المكتوبة **توجيه** مش ضمان. المنع الفعلي من إعدادات الصلاحيات في كل أداة، ومن حماية `main` على GitHub.
- فحص الأسرار بيدور على أشكال معروفة، ومش هيمسك كل سر. وممكن يتخطى بـ `--no-verify`. للحماية الأقوى فعّل secret scanning على GitHub لو متاح لحسابك.
- أول push لمشروع تاريخه كبير ممكن ياخد وقت، لأن الفحص بيعدي على كل commit لسه مترفعش على الـ remote ده.
- لو الفحص مسك حاجة مش سر، وانت موافق، اكتب `ai-kit:allow-secret` في **comment** على نفس السطر.
- إعداد المشروع مبيستبدلش ملفات موجودة. لما الفحص يتحدث في الـ kit، شغّل إعداد المشروع بـ `--update` على المشاريع القديمة: بيستبدل الفحص والـ hooks **بس لو لسه زي ما نزلوا من الـ kit**. لو عدلت فيهم، بيسيبهم ويقولك تدمج بإيدك.
- لو الإعداد خلص برسالة `ACTION` (مثلاً ملف `.env` متسجل في git)، لازم تتحل. الـ script مبيمسحش حاجة من git لوحده.
- لو بتعدل في الـ kit نفسه وغيرت الفحص أو الـ hooks، ضيف البصمة الجديدة في `skills/kit-new-project/assets/known-versions.txt`، والاختبار هيفكرك.
- جرب سيناريوهات `tests/scenarios.md` قبل ما تعتمد عليه.

## اختبار الـ scripts
```bash
node tests/test-kit.mjs
```

## الرخصة
[MIT](LICENSE): استخدمه وعدله براحتك، ومن غير أي ضمان.
