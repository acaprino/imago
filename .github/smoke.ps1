# Throwaway: the merged demo on a real WebView2, after imago-crate's smoke of the plugin (1edf67a).
param([string]$Exe, [string]$Data, [string]$Out)
$ErrorActionPreference = 'Stop'
$Data = [IO.Path]::GetFullPath($Data); $Out = [IO.Path]::GetFullPath($Out)
New-Item -ItemType Directory -Force $Data, $Out | Out-Null
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class W {
  public delegate bool Visit(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rr, B; }
  [StructLayout(LayoutKind.Sequential)] public struct P { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(Visit v, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, Visit v, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref P p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out P p);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(P p);
  public static string Under() { P p; GetCursorPos(out p); IntPtr h = WindowFromPoint(p); return p.X + "," + p.Y + " " + Name(h, true); }
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
  [DllImport("gdi32.dll")] public static extern uint GetPixel(IntPtr dc, int x, int y);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int n);
  static string Name(IntPtr h, bool cls) { var s = new StringBuilder(400); if (cls) GetClassNameW(h, s, 400); else GetWindowTextW(h, s, 400); return s.ToString(); }
  public static string Find(uint pid, string cls, bool visible) {
    string found = null;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && Name(h, true) == cls && (!visible || IsWindowVisible(h))) { R r; GetWindowRect(h, out r); found = h.ToInt64() + "|" + Name(h, false) + "|" + r.L + "," + r.T + "," + (r.Rr - r.L) + "," + (r.B - r.T); return false; }
      return true; }, IntPtr.Zero);
    return found; }
  public static string Child(IntPtr parent, string cls) {
    string found = null;
    EnumChildWindows(parent, (h, l) => { if (Name(h, true) == cls) { R r; GetWindowRect(h, out r); P o = new P(); ClientToScreen(parent, ref o); found = (r.L - o.X) + "," + (r.T - o.Y) + "," + (r.Rr - r.L) + "," + (r.B - r.T) + "|" + r.L + "," + r.T; return false; } return true; }, IntPtr.Zero);
    return found; }
  public static int Dark(IntPtr h) { int v; return DwmGetWindowAttribute(h, 20, out v, 4) == 0 ? v : -1; }
}
'@
$null = [W]::SetProcessDpiAwarenessContext([IntPtr](-4))
$script:bad = 0
function Say($ok, $what) { if ($ok) { Write-Host "PASS  $what" } else { Write-Host "FAIL  $what"; $script:bad++ } }
function Wait-For([scriptblock]$done, [int]$seconds, [int]$every = 100) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $seconds) { $value = & $done; if ($value) { return $value }; Start-Sleep -Milliseconds $every }
  return $null
}
function Main($p) { [W]::Find([uint32]$p.Id, 'Tauri Window', $true) }
function Handle($p) { [IntPtr][int64]("$(Main $p)".Split('|')[0]) }
function Now { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function Ask([string]$action, [string]$more = '') {
  $said = node "$PSScriptRoot/smoke-page.mjs" 9333 $action $more
  if ($LASTEXITCODE) { Say $false "the page did not answer to $action"; return $null }
  if ($said) { return $said | ConvertFrom-Json }
}
function Kept { (Get-Content "$Data/window-theme" -ErrorAction SilentlyContinue) }
function Screen-Shot([string]$name) {
  Add-Type -AssemblyName System.Drawing, System.Windows.Forms
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bitmap = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  [System.Drawing.Graphics]::FromImage($bitmap).CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bitmap.Save("$Out/$name.png")
}

$env:IMAGO_DEMO_HOME = $Data
$env:WEBVIEW2_USER_DATA_FOLDER = [IO.Path]::Combine($Data, "webview")
$screen = (Get-CimInstance Win32_VideoController | Select-Object -First 1); Write-Host "screen $($screen.CurrentHorizontalResolution)x$($screen.CurrentVerticalResolution), Windows $((Get-CimInstance Win32_OperatingSystem).Version)"

function Start-Demo {
  $p = Start-Process $Exe -PassThru; $null = $p.Handle
  $script:made = Wait-For { if ([W]::Find([uint32]$p.Id, 'Tauri Window', $false)) { Now } } 20 10
  $script:hidden = -not (Main $p)
  $script:shown = Wait-For { if (Main $p) { Now } } 20 10
  $script:darkAtFirst = [W]::Dark((Handle $p))
  $p
}

Write-Host '--- the first start: nothing kept'
$demo = Start-Demo
Start-Sleep 4
Write-Host "      made $script:made, hidden $script:hidden, shown $script:shown, window $(Main $demo), running $(-not $demo.HasExited)"
Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -notmatch '--type=' } | ForEach-Object { Write-Host "      engine $($_.ProcessId) of $($_.ParentProcessId): $($_.CommandLine)" }
Screen-Shot 'start'
$first = Ask 'read'
if (-not $first) { exit 1 }
$call = { param($name) $first.ipc | Where-Object { $_.call -eq "plugin:imago-shell|$name" } | Select-Object -First 1 }
foreach ($name in 'kept_theme', 'set_theme', 'caption', 'ready') { $c = & $call $name; Say ($c -and $c.status -eq 200) "$name answered: $($c | ConvertTo-Json -Compress)" }
$ready = & $call 'ready'; $theme = & $call 'set_theme'
$readyAt = $first.timeOrigin + $ready.end
Write-Host "      window made hidden: $script:hidden; shown $($script:shown - $script:made) ms after it was made; ready answered $([Math]::Round($readyAt - $script:made)) ms after; shown $([Math]::Round($script:shown - $readyAt)) ms after ready answered"
Say $script:hidden 'the window is made hidden'
Say ($script:shown -ge ($first.timeOrigin + $ready.start - 60) -and $script:shown -le ($readyAt + 600)) 'the window is shown by ready: not before it was sent, and at once after'
Say ($theme.end -le $ready.start) 'the theme was told before ready was sent'
Say ((Kept) -eq 'dark') "the choice is kept: $(Kept)"
Say ($script:darkAtFirst -eq 1 -and $first.scheme -eq 'dark') "the window is dark as it is shown (DWM $script:darkAtFirst, page $($first.scheme))"
$overlay = [W]::Child((Handle $demo), 'ImagoMaximizeOverlay')
$o = "$overlay".Split('|')[0].Split(',') | ForEach-Object { [int]$_ }
Write-Host "      overlay $overlay, button $($first.button | ConvertTo-Json -Compress)"
Say ($o.Count -eq 4 -and $o[0] -eq $first.button.x -and $o[2] -eq $first.button.width -and [Math]::Abs(($o[1] + $o[3]) - ($first.button.y + $first.button.height)) -le 1) 'caption: the overlay lies over the maximize button'
Say (-not $first.notices) "no notice of a failed call: $($first.notices -join ' / ')"
Screen-Shot 'first-dark'

Write-Host '--- the mouse over the maximize button, the real one'
$at = "$overlay".Split('|')[1].Split(',') | ForEach-Object { [int]$_ }
$null = [W]::SetCursorPos($at[0] + 20, $at[1] + 20); Start-Sleep -Milliseconds 300
foreach ($k in 1..6) { [W]::mouse_event(1, $(if ($k % 2) { 2 } else { -2 }), 1, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 150 }
Write-Host "      the pointer is at $([W]::Under())"
$hover = Ask 'read'
Say ($hover.os -eq 'hover') "the real pointer on the maximize button reaches the page: data-os-state is '$($hover.os)'; the pointer is at $([W]::Under())"
Screen-Shot 'snap-layouts'
$null = [W]::SetCursorPos(5, 5); Start-Sleep -Milliseconds 600

Write-Host '--- the theme, the title, the job, the zoom, the buttons'
$light = Ask 'light'
Say ($light.scheme -eq 'light' -and (Kept) -eq 'light' -and [W]::Dark((Handle $demo)) -eq 0) "light: page $($light.scheme), kept $(Kept), DWM $([W]::Dark((Handle $demo)))"
Screen-Shot 'light'
$system = Ask 'system'
Say ((Kept) -eq 'system') "system: kept $(Kept), page $($system.scheme), engine $($system.system)"
$null = Ask 'light'
$null = Ask 'title'
Say ("$(Main $demo)".Split('|')[1] -eq '3 items · Imago demo') "the title of the window: $("$(Main $demo)".Split('|')[1])"
$job = Ask 'job'
$sent = @($job.ipc | Where-Object { $_.call -eq 'plugin:imago-shell|chrome' })
Say ($sent.Count -ge 3 -and -not ($sent | Where-Object { $_.status -ne 200 })) "chrome answered $($sent.Count) times"
$overlap = 0; for ($k = 1; $k -lt $sent.Count; $k++) { if ($sent[$k].start -lt $sent[$k - 1].end) { $overlap++ } }
Say ($overlap -eq 0) "no chrome was sent before the one before had answered ($overlap)"
$before = Main $demo
$null = Ask 'maximize'; $large = Main $demo
$null = Ask 'restore'; $again = Main $demo
Write-Host "      $before / $large / $again"
Say ($large -ne $before -and $again.Split('|')[2] -eq $before.Split('|')[2]) 'maximize and restore'
$zoom = Ask 'zoom'
Say ([Math]::Abs($zoom.ratio - 1.1 * $first.ratio) -lt 0.02) "Ctrl+= : ratio $($first.ratio) to $($zoom.ratio)"
$o = "$([W]::Child((Handle $demo), 'ImagoMaximizeOverlay'))".Split('|')[0].Split(',') | ForEach-Object { [int]$_ }
Say ($o[0] -eq $zoom.button.x -and $o[2] -eq $zoom.button.width) "the overlay follows the zoom: $($o -join ',') / $($zoom.button | ConvertTo-Json -Compress)"

Write-Host '--- the browser process is lost'
# Dark is on the disk, and light is chosen just before the process dies.
$null = Ask 'dark'
Start-Sleep 12
$null = Ask 'light'
Say ((Kept) -eq 'light') "light is kept by the window: $(Kept)"
$chosen = Now
$mine = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.ParentProcessId -eq $demo.Id -and $_.CommandLine -notmatch '--type=' }
$old = "$(Main $demo)".Split('|')[0]
$mine | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host "      killed $((Now) - $chosen) ms after the choice was read back"
$rebuilt = Wait-For { $m = Main $demo; if ($m -and $m.Split('|')[0] -ne $old) { $m } } 30
Say ($rebuilt -and -not $demo.HasExited) "the window is built again and the program goes on (on_run_event): $rebuilt"
$after = Ask 'read'
Start-Sleep 2
Say ($after.scheme -eq 'light' -and [W]::Dark((Handle $demo)) -eq 0 -and (Kept) -eq 'light' -and -not $after.notices) "in the theme chosen last: page $($after.scheme), DWM $([W]::Dark((Handle $demo))), kept $(Kept)"

Write-Host '--- the second start'
$null = Ask 'close'
$null = $demo.WaitForExit(15000)
Say ($demo.HasExited -and $demo.ExitCode -eq 0) "the close button ends the program (code $($demo.ExitCode))"
if (-not $demo.HasExited) { Stop-Process -Id $demo.Id -Force }
Start-Sleep 2
$demo = Start-Demo
Say ($script:darkAtFirst -eq 0) "the kept theme is the first frame's (DWM $script:darkAtFirst)"
$second = Ask 'read'
Say ($second.scheme -eq 'light' -and [Math]::Abs($second.ratio - 1.1 * $first.ratio) -lt 0.02) "light, and the zoom is kept (ratio $($second.ratio))"
Screen-Shot 'second-light'
$other = Start-Process $Exe -PassThru; $null = $other.Handle
$null = $other.WaitForExit(8000)
Say ($other.HasExited -and -not $demo.HasExited) 'a second copy ends, the first one stays'
$woke = Ask 'read'
Write-Host "      the two pages spoke: $(@($woke.ipc).Count) calls"
Say ("$($woke.notices -join ' ')" -match 'The window is back') "the page was told it is shown again: $($woke.notices -join ' / ')"
$null = Ask 'close'
$null = $demo.WaitForExit(15000)
if (-not $demo.HasExited) { Stop-Process -Id $demo.Id -Force }

Write-Host '--- the browser keeps nothing'
Start-Sleep 3
Remove-Item "$Data/webview" -Recurse -Force
$demo = Start-Demo
Start-Sleep 2
$lost = Ask 'read'
Say ($script:darkAtFirst -eq 0 -and $lost.scheme -eq 'light' -and (Kept) -eq 'light') "the theme the window keeps is the page's: DWM $script:darkAtFirst, page $($lost.scheme), kept $(Kept)"
Screen-Shot 'nothing-in-the-browser'
$null = Ask 'close'
$null = $demo.WaitForExit(15000)
if (-not $demo.HasExited) { Stop-Process -Id $demo.Id -Force }
Write-Host "failures: $script:bad"
exit $script:bad
