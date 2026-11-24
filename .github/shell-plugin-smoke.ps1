param([string]$Exe, [string]$Data, [string]$Page)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
public static class W {
  public delegate bool Visit(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rr, B; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(Visit v, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, Visit v, IntPtr l);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref P p);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetSystemMenu(IntPtr h, bool r);
  [DllImport("user32.dll")] public static extern int GetMenuItemCount(IntPtr m);
  [DllImport("user32.dll")] public static extern uint GetMenuItemID(IntPtr m, int i);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetMenuStringW(IntPtr m, uint i, StringBuilder s, int n, uint f);
  [StructLayout(LayoutKind.Sequential)] public struct P { public int X, Y; }
  public static string Overlay(IntPtr parent) {
    string found = null; P o = new P(); ClientToScreen(parent, ref o);
    EnumChildWindows(parent, (h, l) => { var c = new StringBuilder(200); GetClassNameW(h, c, 200); R r; GetWindowRect(h, out r);
      if (c.ToString() == "ImagoMaximizeOverlay") found = h.ToInt64() + "|" + (r.L - o.X) + "," + (r.T - o.Y) + "," + (r.Rr - r.L) + "x" + (r.B - r.T) + "|" + IsWindowVisible(h);
      return true; }, IntPtr.Zero);
    return found; }
  public static uint MenuItem(IntPtr h, string text) {
    IntPtr m = GetSystemMenu(h, false);
    for (int i = 0; i < GetMenuItemCount(m); i++) { var s = new StringBuilder(200); GetMenuStringW(m, (uint)i, s, 200, 0x400); if (s.ToString() == text) return GetMenuItemID(m, i); }
    return 0; }
  public static List<string> Of(uint pid, string cls) {
    var found = new List<string>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) { var t = new StringBuilder(400); GetWindowTextW(h, t, 400); var c = new StringBuilder(200); GetClassNameW(h, c, 200); R r; GetWindowRect(h, out r);
        if (c.ToString() == cls) found.Add(h.ToInt64() + "|" + t + "|" + r.L + "," + r.T + "," + (r.Rr - r.L) + "x" + (r.B - r.T)); }
      return true; }, IntPtr.Zero);
    return found; }
}
'@
$script:bad = 0
function Say($ok, $what) { if ($ok) { Write-Host "PASS  $what" } else { Write-Host "FAIL  $what"; $script:bad++ } }
function Wait-For([scriptblock]$done, [int]$seconds) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $seconds) { $value = & $done; if ($value) { return $value }; Start-Sleep -Milliseconds 100 }
  return $null
}
function Main($p) { @([W]::Of([uint32]$p.Id, 'Tauri Window'))[0] }
function Handle($p) { [IntPtr][int64]("$(Main $p)".Split('|')[0]) }
Add-Type -AssemblyName System.Drawing
function Pixel($p) {
  $at = "$(Main $p)".Split('|')[2]; $place, $size = $at.Split('x')[0].Split(','), $at.Split('x')[1]
  $bitmap = [Drawing.Bitmap]::new(1, 1)
  [Drawing.Graphics]::FromImage($bitmap).CopyFromScreen([int]$place[0] + 300, [int]$place[1] + 300, 0, 0, [Drawing.Size]::new(1, 1))
  $c = $bitmap.GetPixel(0, 0); '{0:X2}{1:X2}{2:X2}' -f $c.R, $c.G, $c.B
}
function Title($p) { "$(Main $p)".Split('|')[1] }
function Box($p) { @([W]::Of([uint32]$p.Id, '#32770'))[0] }
function Engine($p, [string]$type) {
  $all = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'"
  $mine = $all | Where-Object { $_.ParentProcessId -eq $p.Id -and $_.CommandLine -notmatch '--type=' }
  if ($type -eq 'browser') { return $mine }
  return $all | Where-Object { $_.CommandLine -match "--type=$type" -and ($mine.ProcessId -contains $_.ParentProcessId) }
}
function Kill-Engine($p, $type) { Engine $p $type | Select-Object -First 1 | ForEach-Object { Stop-Process -Id $_.ProcessId -Force } }
function Start-Server { Start-Process python -ArgumentList '-I', "$PSScriptRoot/shell-plugin-server.py", $Page -PassThru -WindowStyle Hidden }
function Start-Demo { $p = Start-Process $Exe -PassThru; $null = $p.Handle; $p }
function Close-Demo($p) {
  $null = [W]::PostMessageW([IntPtr][int64]("$(Main $p)".Split('|')[0]), 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  $null = $p.WaitForExit(15000)
  Say ($p.HasExited -and $p.ExitCode -eq 0) "closing ends the program (code $($p.ExitCode))"
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
  Start-Sleep 2
}

$env:IMAGO_DEMO_HOME = "$Data-embedded"
Write-Host '--- the embedded page'
$demo = Start-Demo
$title = Wait-For { $t = Title $demo; if ($t -match '^Smoke') { $t } } 25
Write-Host "now: $(Main $demo)"
Say ($title -match 'tauri.localhost set_theme:ok caption:ok chrome:ok ready:ok') "the page calls the four commands, and ready shows the window (the three seconds are sixty in this build): $title"
Say ((Get-Content "$env:IMAGO_DEMO_HOME/window-theme" -ErrorAction SilentlyContinue) -eq 'dark') 'the theme is kept'
Write-Host "Windows' apps are light: $((Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Themes/Personalize' -ErrorAction SilentlyContinue).AppsUseLightTheme)"
Start-Sleep 1
Say ((Pixel $demo) -eq '12161E') "the opaque ground of the dark theme is on the screen: $(Pixel $demo)"
$overlay = [W]::Overlay((Handle $demo))
Say ($overlay -match '\|600,\d+,46x\d+\|True') "the overlay lies where caption said (600,10 46x32): $overlay"
$hwnd = [IntPtr][int64]($overlay.Split('|')[0])
$null = [W]::PostMessageW($hwnd, 0x00A1, [IntPtr]9, [IntPtr]::Zero); $null = [W]::PostMessageW($hwnd, 0x00A2, [IntPtr]9, [IntPtr]::Zero)
Say (Wait-For { [W]::IsZoomed((Handle $demo)) } 5) 'a press on the overlay maximizes'
$null = [W]::PostMessageW($hwnd, 0x00A1, [IntPtr]9, [IntPtr]::Zero); $null = [W]::PostMessageW($hwnd, 0x00A2, [IntPtr]9, [IntPtr]::Zero)
Say (Wait-For { -not [W]::IsZoomed((Handle $demo)) } 5) 'and a second one restores'
$item = [W]::MenuItem((Handle $demo), 'Reload interface')
$null = [W]::PostMessageW((Handle $demo), 0x0112, [IntPtr][int]$item, [IntPtr]::Zero)
Say (Wait-For { (Title $demo) -match 'load:2' } 15) "the reload item ($item) reloads: $(Title $demo)"
$null = [W]::SetWindowPos((Handle $demo), [IntPtr]::Zero, 120, 60, 700, 560, 0x4014)
Start-Sleep 1
$place = "$(Main $demo)".Split('|')[2]
$second = Start-Demo
Say ($second.WaitForExit(15000) -and -not $demo.HasExited) 'a second start ends and the first lives'
Close-Demo $demo
$demo = Start-Demo
$title = Wait-For { $t = Title $demo; if ($t -match '^Smoke') { $t } } 25
Say ($title -match 'caption:ok' -and $title -notmatch 'set_theme' -and $title -match 'dark:true') "a restart, with no set_theme from the page, is dark from the saved theme: $title"
Start-Sleep 1
Say ((Pixel $demo) -eq '12161E') "its ground is the saved theme's: $(Pixel $demo)"
Say ("$(Main $demo)".Split('|')[2] -eq $place) "and it is where it was: $place -> $("$(Main $demo)".Split('|')[2])"
Close-Demo $demo

$env:IMAGO_DEMO_HOME = "$Data-remote"
$env:SMOKE_URL = 'http://127.0.0.1:50777/index.html?token=x'
Write-Host '--- a page on http://127.0.0.1, with a policy that has no connect-src'
$server = Start-Server
Start-Sleep 2
$demo = Start-Demo
$title = Wait-For { $t = Title $demo; if ($t -match '^Smoke') { $t } } 25
Write-Host "now: $(Main $demo)"
Say ($title -match '127.0.0.1:50777 set_theme:ok caption:ok chrome:ok ready:ok') "the page calls the four commands: $title"
$still = Wait-For { $t = Title $demo; if ($t -match '^Still') { $t } } 15
Say ($still -match 'Still http://127.0.0.1:50777 open:null') "another origin and a new window are refused: $still"
$null = [W]::SetWindowPos([IntPtr][int64]("$(Main $demo)".Split('|')[0]), [IntPtr]::Zero, 120, 60, 700, 560, 0x4014)
Start-Sleep 1
$before = Main $demo
Kill-Engine $demo 'browser'
$after = Wait-For { $m = Main $demo; if ($m -and $m.Split('|')[0] -ne $before.Split('|')[0] -and $m -match 'Still') { $m } } 30
Say ($after -and $after.Split('|')[2] -eq $before.Split('|')[2]) "a killed browser process: built again on its page, where it was: $before -> $after"

Stop-Process -Id $server.Id -Force
Kill-Engine $demo 'renderer'
$box = Wait-For { Box $demo } 40
Say $box "the server is down: after its reloads the person is asked: $box"
$server = Start-Server
Start-Sleep 2
$null = [W]::PostMessageW([IntPtr][int64]("$box".Split('|')[0]), 0x0111, [IntPtr]6, [IntPtr]::Zero)
$reloaded = Wait-For { if (-not (Box $demo)) { Engine $demo 'renderer' } } 15
$null = [W]::PostMessageW([IntPtr][int64]("$(Main $demo)".Split('|')[0]), 0, [IntPtr]::Zero, [IntPtr]::Zero)
Say ($reloaded -and -not $demo.HasExited) 'Yes reloads it'
Write-Host "requests the server saw since its restart: $((Get-Content "$PSScriptRoot/../server.log" -ErrorAction SilentlyContinue | Select-Object -Last 6) -join ' ; ')"
Close-Demo $demo
Stop-Process -Id $server.Id -Force
Write-Host "failures: $script:bad"
exit $script:bad
