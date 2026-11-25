# Throwaway: glass on and off on a real window, the demo's, built from this branch. The page's own grounds are taken away
# over the debugging port, so that what shows behind the title bar is the window itself: its colour, or the acrylic.
param([string]$Exe, [string]$Data, [string]$Out)
$ErrorActionPreference = 'Stop'
$Data = [IO.Path]::GetFullPath($Data); $Out = [IO.Path]::GetFullPath($Out)
New-Item -ItemType Directory -Force $Data, $Out | Out-Null
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  public delegate bool Visit(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rr, B; }
  [StructLayout(LayoutKind.Sequential)] public struct P { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(Visit v, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref P p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")] public static extern uint GetPixel(IntPtr dc, int x, int y);
  public static IntPtr Find(uint pid, bool visible) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); var s = new StringBuilder(64); GetClassNameW(h, s, 64);
      if (p == pid && s.ToString() == "Tauri Window" && (!visible || IsWindowVisible(h))) { found = h; return false; } return true; }, IntPtr.Zero);
    return found; }
  // The client area on the screen: left, top, width, height.
  public static int[] Client(IntPtr h) { R r; GetClientRect(h, out r); P o = new P(); ClientToScreen(h, ref o); return new[] { o.X, o.Y, r.Rr, r.B }; }
  // A point off the screen is -1, -1, -1.
  public static int[] Pixel(int x, int y) { IntPtr dc = GetDC(IntPtr.Zero); uint c = GetPixel(dc, x, y); ReleaseDC(IntPtr.Zero, dc); if (c == 0xFFFFFFFF) return new[] { -1, -1, -1 }; return new[] { (int)(c & 0xFF), (int)((c >> 8) & 0xFF), (int)((c >> 16) & 0xFF) }; }
}
'@
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
$null = [W]::SetProcessDpiAwarenessContext([IntPtr](-4))
$script:bad = 0
function Say($ok, $what) { if ($ok) { Write-Host "PASS  $what" } else { Write-Host "FAIL  $what"; $script:bad++ } }
function Wait-For([scriptblock]$done, [int]$seconds, [int]$every = 50) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $seconds) { $value = & $done; if ($value) { return $value }; Start-Sleep -Milliseconds $every }
  return $null
}
function Ask([string]$action, [string]$more = '') {
  $said = node "$PSScriptRoot/glass-page.mjs" 9333 $action $more
  if ($LASTEXITCODE) { Say $false "the page did not answer to $action $more"; return $null }
  if ($said) { return $said | ConvertFrom-Json }
}
function Kept { "$(Get-Content "$Data/window-material" -ErrorAction SilentlyContinue)" }
function Shot([string]$name) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bitmap = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  [System.Drawing.Graphics]::FromImage($bitmap).CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bitmap.Save("$Out/$name.png")
}
$DARK = @(18, 22, 30); $LIGHT = @(246, 247, 249)
function Text($c) { "($($c -join ','))" }
function Same($a, $b, [int]$by = 2) { for ($k = 0; $k -lt 3; $k++) { if ([Math]::Abs($a[$k] - $b[$k]) -gt $by) { return $false } }; return $true }
# Two points of the title bar, above its words: the page draws nothing there once its grounds are taken away.
function Points($h) { $c = [W]::Client($h); @(@([int]($c[0] + $c[2] * 0.45), ($c[1] + 8)), @([int]($c[0] + $c[2] * 0.62), ($c[1] + 8))) }
function Look($h) { Points $h | ForEach-Object { , [W]::Pixel($_[0], $_[1]) } }
function Front($h) {
  $null = [W]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x13)
  for ($try = 0; $try -lt 6; $try++) {
    if ([W]::GetForegroundWindow() -eq $h) { return $true }
    [W]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [W]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    $null = [W]::SetForegroundWindow($h); Start-Sleep -Milliseconds 150
  }
  return ([W]::GetForegroundWindow() -eq $h)
}
function Win($id, [bool]$visible) { $h = [W]::Find([uint32]$id, $visible); if ($h -ne [IntPtr]::Zero) { $h } }
$script:backdrop = $null
function Lift { if ($script:backdrop -and -not $script:backdrop.HasExited) { Stop-Process -Id $script:backdrop.Id -Force; Start-Sleep -Milliseconds 300 } }
function Behind([int]$id, [string]$color) {
  Lift
  $script:backdrop = Start-Process pwsh -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile', '-File', "$PSScriptRoot/../examples/demo/backdrop.ps1", '-ProcessId', $id, '-Color', $color, '-Seconds', '600'
  Start-Sleep -Milliseconds 1800
}
# The title bar over a dark window and over a bright one, active: the two looks, and a photograph of each.
function Both($p, [string]$name) {
  $h = Win $p.Id $true
  Behind $p.Id '12,12,12'; $active = Front $h; Start-Sleep -Milliseconds 700; $dark = Look $h; Shot "$name-over-dark"
  Behind $p.Id '255,255,255'; $active = (Front $h) -and $active; Start-Sleep -Milliseconds 700; $bright = Look $h; Shot "$name-over-bright"
  Write-Host "      $name, active $active : over dark $(($dark | ForEach-Object { Text $_ }) -join ' '), over bright $(($bright | ForEach-Object { Text $_ }) -join ' ')"
  @{ dark = $dark; bright = $bright; active = $active }
}
function Ground($look, $ground) { ($look.dark + $look.bright | Where-Object { -not (Same $_ $ground) }).Count -eq 0 }
# Glass: neither ground, nor what lies behind the window as it is (the dark or the bright window): the acrylic.
function Glassy($look) { ($look.dark + $look.bright | Where-Object { (Same $_ $DARK 6) -or (Same $_ $LIGHT 6) -or (Same $_ $FLOOR 6) -or (Same $_ @(255, 255, 255) 6) }).Count -eq 0 }
# What lies behind shows through the acrylic: it differs over a dark and over a bright window. Said, not judged: a runner
# may draw the acrylic with nothing of what is behind it.
function Through($look) { $seen = -not (Same $look.dark[0] $look.bright[0] 12); Write-Host "      what lies behind shows through: $seen"; $seen }
# The window, 700 by 600 at 40,40 over the bright window, is made 200 wider, and its new strip (within the bright window) is
# looked at for half a second: never bright. The screen of the runner is 1024 wide: the window is made smaller first.
function Edge($p, [string]$name) {
  $h = Win $p.Id $true
  $was = [W]::Client($h)
  $null = [W]::SetWindowPos($h, [IntPtr]::Zero, 40, 40, 700, 600, 0x14); Start-Sleep -Milliseconds 600
  Behind $p.Id '255,255,255'; $null = Front $h; Start-Sleep -Milliseconds 500
  $c = [W]::Client($h)
  Write-Host "      $name, the window at $($c -join ',')"
  $null = [W]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, $c[2] + 200, $c[3], 0x16)
  $seen = @(); $start = Get-Date
  while (((Get-Date) - $start).TotalMilliseconds -lt 500) { $seen += , [W]::Pixel($c[0] + $c[2] + 40, $c[1] + 8); $seen += , [W]::Pixel($c[0] + $c[2] + 40, $c[1] + [int]($c[3] / 2)); Start-Sleep -Milliseconds 5 }
  Shot "$name-wider"
  $null = [W]::SetWindowPos($h, [IntPtr]::Zero, $was[0], $was[1], $was[2], $was[3], 0x14); Start-Sleep -Milliseconds 600
  $shades = $seen | ForEach-Object { Text $_ } | Group-Object | ForEach-Object { "$($_.Name) x$($_.Count)" }
  Write-Host "      $name, the new strip of a wider window: $($shades -join ', ')"
  ($seen | Where-Object { ($_ | Measure-Object -Minimum).Minimum -gt 200 -or $_[0] -lt 0 }).Count -eq 0
}

$env:IMAGO_DEMO_HOME = $Data
$env:WEBVIEW2_USER_DATA_FOLDER = [IO.Path]::Combine($Data, "webview")
Write-Host "Windows $((Get-CimInstance Win32_OperatingSystem).Version)"
Write-Host "transparency effects: $((Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -ErrorAction SilentlyContinue).EnableTransparency)"

# A dark floor under everything, for the whole run: what a window that is not drawn yet would show.
$FLOOR = @(12, 12, 12)
Set-Content "$Data/floor.ps1" @'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$f = New-Object System.Windows.Forms.Form
$f.FormBorderStyle = 'None'; $f.StartPosition = 'Manual'; $f.ShowInTaskbar = $false
$f.BackColor = [System.Drawing.Color]::FromArgb(12, 12, 12)
$f.Bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$f.Show()
$until = (Get-Date).AddSeconds(900)
while ((Get-Date) -lt $until) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 40 }
'@
$under = Start-Process pwsh -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile', '-File', "$Data/floor.ps1"
Start-Sleep 3

# The window from the moment it is visible: every look of its title bar for a second and a half, over the dark floor.
function Start-Demo([string]$name) {
  Lift
  $p = Start-Process $Exe -PassThru; $null = $p.Handle
  $null = Wait-For { Win $p.Id $false } 20 10
  $h = Wait-For { Win $p.Id $true } 20 5
  $seen = @(); $start = Get-Date
  while (((Get-Date) - $start).TotalMilliseconds -lt 1500) { $seen += , (Look $h); Start-Sleep -Milliseconds 15 }
  $null = Front $h
  $shades = $seen | ForEach-Object { $_ } | ForEach-Object { Text $_ } | Group-Object | ForEach-Object { "$($_.Name) x$($_.Count)" }
  Write-Host "      $name, the first $($seen.Count) looks: $($shades -join ', ')"
  @{ p = $p; seen = $seen }
}

Write-Host '--- a fresh install: no glass'
$run = Start-Demo 'first start'
$demo = $run.p
Say (($run.seen | ForEach-Object { $_ } | Where-Object { -not (Same $_ $DARK) -and -not (Same $_ $FLOOR) }).Count -eq 0) 'no flash: the window is the dark ground from its first frame (or not composed yet: the floor)'
$said = Ask 'kept'
Say ($said.said.ok -and $said.said.answer -eq $false) "kept_glass answers the app's default: $($said.said | ConvertTo-Json -Compress)"

Write-Host '--- the page as Sigrid draws it: the command of the look'
$page = Ask 'command'
Say ($page.material -eq 'glass' -and (Kept) -eq 'glass') "the command: the page is glass ($($page.material)), the window keeps $(Kept)"
$drawn = Both $demo 'page-glass'
Say (Glassy $drawn) 'the title bar of the page as Sigrid draws glass is neither the ground nor what lies behind'
$page = Ask 'command'
Say ($null -eq $page.material -and (Kept) -eq 'solid') "the command again: the page is solid, the window keeps $(Kept)"
$drawn = Both $demo 'page-solid'
Say (Ground $drawn $DARK) 'and the title bar is the ground again'
$null = Ask 'clear'
$off = Both $demo 'off'
Say (Ground $off $DARK) 'without glass the window is its dark ground, over a dark window and a bright one'

Write-Host '--- glass on, while it runs'
$said = Ask 'glass' 'on'
Say ($said.said.ok) "set_glass on answered: $($said.said | ConvertTo-Json -Compress)"
Say ((Kept) -eq 'glass') "the choice is kept: $(Kept)"
$on = Both $demo 'on'
Say (Glassy $on) 'with glass the window is the acrylic: neither its ground nor what lies behind it'
$null = Through $on

Write-Host '--- the theme changes under glass'
$null = Ask 'light'
$underLight = Both $demo 'on-light'
Say (Glassy $underLight) 'a theme told after glass keeps the glass'
$null = Through $underLight
$null = Ask 'glass' 'off'
$lightOff = Both $demo 'off-light'
Say (Ground $lightOff $LIGHT) 'glass off in light: the light ground, over both'
$null = Ask 'dark'
$null = Ask 'glass' 'on'
$null = Ask 'glass' 'off'
$back = Both $demo 'on-then-off'
Say (Ground $back $DARK) 'on, then off: the dark ground again, over both'
Say (Edge $demo 'on-then-off') 'on, then off: the edge of a window made wider is never what lies behind it'
Say ((Kept) -eq 'solid') "kept: $(Kept)"

Write-Host '--- the choice survives a restart: glass'
$null = Ask 'glass' 'on'
$null = Ask 'close'
$null = $demo.WaitForExit(15000)
if (-not $demo.HasExited) { Stop-Process -Id $demo.Id -Force }
Start-Sleep 2
$run = Start-Demo 'start with glass'
$demo = $run.p
Say (($run.seen | ForEach-Object { $_ } | Where-Object { ($_ | Measure-Object -Maximum).Maximum -gt 150 }).Count -eq 0) 'no flash: no bright frame at the start of a glass window, over a dark window'
$said = Ask 'kept'
Say ($said.said.ok -and $said.said.answer -eq $true) "kept_glass answers the kept choice: $($said.said | ConvertTo-Json -Compress)"
$null = Ask 'clear'
$started = Both $demo 'started-glass'
Say (Glassy $started) 'the window starts as glass'
$null = Through $started
$null = Ask 'glass' 'off'
$startedOff = Both $demo 'started-glass-off'
Say (Ground $startedOff $DARK) 'a window built as glass and turned off is its dark ground, over both'
Say (Edge $demo 'built-glass-then-off') 'its edge, made wider, is never what lies behind it'

Write-Host '--- the choice survives a restart: no glass'
$null = Ask 'close'
$null = $demo.WaitForExit(15000)
if (-not $demo.HasExited) { Stop-Process -Id $demo.Id -Force }
Start-Sleep 2
$run = Start-Demo 'start without glass'
$demo = $run.p
Say (($run.seen | ForEach-Object { $_ } | Where-Object { -not (Same $_ $DARK) -and -not (Same $_ $FLOOR) }).Count -eq 0) 'no flash: the window is the dark ground from its first frame (or not composed yet: the floor)'
$said = Ask 'kept'
Say ($said.said.ok -and $said.said.answer -eq $false) "kept_glass: $($said.said | ConvertTo-Json -Compress)"
$null = Ask 'clear'
$solid = Both $demo 'started-solid'
Say (Ground $solid $DARK) 'it starts as its ground'
Say (Edge $demo 'solid') 'its edge, made wider, is never what lies behind it'
$null = Ask 'close'
$null = $demo.WaitForExit(15000)
if (-not $demo.HasExited) { Stop-Process -Id $demo.Id -Force }
Lift
Stop-Process -Id $under.Id -Force -ErrorAction SilentlyContinue
Write-Host "failures: $script:bad"
exit $script:bad
