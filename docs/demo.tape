# gh-ai-rank-tracker — vhs demo script
#
# Render a terminal GIF with charmbracelet/vhs (https://github.com/charmbracelet/vhs):
#
#   vhs docs/demo.tape        # → docs/demo.gif
#
# Then reference docs/demo.gif in the README hero placeholder. A plain-text
# transcript of the same commands is committed at docs/demo.txt as a fallback.

Output docs/demo.gif

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 760
Set Padding 18
Set Theme "Catppuccin Mocha"

Type "# 1) Instant demo — AI Visibility Score (no API keys)"
Enter
Type "npm run demo"
Enter
Sleep 3s

Type "# 2) Run a campaign and persist it (local-first store)"
Enter
Type "npm run cli -- campaign run --demo --store .tracker/demo.json"
Enter
Sleep 2s
Type "npm run cli -- campaign run --demo --store .tracker/demo.json"
Enter
Sleep 2s

Type "# 3) See the trend over time"
Enter
Type "npm run cli -- campaign history demo-growthhackers --store .tracker/demo.json"
Enter
Sleep 3s

Type "# 4) Export a shareable report"
Enter
Type "npm run cli -- campaign export demo-growthhackers --format md --out report.md --store .tracker/demo.json"
Enter
Sleep 2s

Type "# Track your brand's AI share of voice over time. → growthackers.io"
Enter
Sleep 3s
