param(
  [Parameter(Mandatory = $true)][ValidateSet('state', 'rect', 'place', 'capture', 'region', 'move', 'click')][string]$Action,
  [int]$ProcessId,
  [string]$Out,
  # capture: the pixels to read, "name:x:y;name:x:y", in physical pixels of the window's client area.
  [string]$Points = '',
  # place: where the window's top left goes (capture does it again when it is given). region: a rectangle of the
  # screen. move and click: the point of the screen. Physical pixels.
  [int]$X, [int]$Y, [int]$Width, [int]$Height,
  # region: a picture to compare with; the answer says how many pixels differ.
  [string]$Compare = ''
)
# Photographs the real window from the screen, and moves the real mouse over it: only a copy of the screen has what
# Windows composes.
# Every answer is one line of JSON on the output.
$ErrorActionPreference = 'Stop'
Add-Type @'
using System; using System.Runtime.InteropServices;
public class Cap {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref P p);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int command);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out P p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  public struct R { public int L, T, Rr, B; }
  public struct P { public int X, Y; }
}
'@
Add-Type -AssemblyName System.Drawing
[Cap]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null   # per-monitor v2: every number is a physical pixel

function Get-Handle {
  $h = (Get-Process -Id $ProcessId).MainWindowHandle
  if ($h -eq [IntPtr]::Zero) { throw "process $ProcessId has no window" }
  return $h
}
function Get-Geometry($h) {
  $w = New-Object Cap+R; [Cap]::GetWindowRect($h, [ref]$w) | Out-Null
  $c = New-Object Cap+R; [Cap]::GetClientRect($h, [ref]$c) | Out-Null
  $o = New-Object Cap+P; [Cap]::ClientToScreen($h, [ref]$o) | Out-Null
  return [ordered]@{ left = $w.L; top = $w.T; width = $w.Rr - $w.L; height = $w.B - $w.T; clientLeft = $o.X; clientTop = $o.Y; clientWidth = $c.Rr; clientHeight = $c.B }
}
function Copy-Screen([int]$left, [int]$top, [int]$width, [int]$height) {
  $bmp = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($left, $top, 0, 0, (New-Object System.Drawing.Size $width, $height))
  $g.Dispose()
  return $bmp
}
function Mouse([uint32]$flags) { [Cap]::mouse_event($flags, 0, 0, 0, [UIntPtr]::Zero) }
function Get-Cursor { $p = New-Object Cap+P; [Cap]::GetCursorPos([ref]$p) | Out-Null; return @($p.X, $p.Y) }

# The window must be the active one: Windows draws the acrylic only for the active window and a plain fill for the
# others, so a capture of an inactive window judges nothing. It is raised above every other window and left there for
# the whole run (a window lowered between captures ends up behind the one in use), then activated. Windows lets a
# process take the foreground only when input has just reached it, so an Alt tap comes first. It answers whether the
# window is the active one in the end.
function Set-Active($h, [bool]$move) {
  if ([Cap]::IsIconic($h)) { [Cap]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 300 }   # restored if it was minimized
  # Topmost; no size, no activation. Put back where the backdrop lies when a place is given: the window may have been moved.
  if ($move) { [Cap]::SetWindowPos($h, [IntPtr](-1), $X, $Y, 0, 0, 0x11) | Out-Null } else { [Cap]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x13) | Out-Null }
  for ($try = 0; $try -lt 6; $try++) {
    if ([Cap]::GetForegroundWindow() -eq $h) { return $true }
    [Cap]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [Cap]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [Cap]::SetForegroundWindow($h) | Out-Null
    Start-Sleep -Milliseconds 150
  }
  return ([Cap]::GetForegroundWindow() -eq $h)
}

switch ($Action) {
  'state' {
    # The lock screen (LogonUI) covers the desktop: a copy of the screen shows it, never the window, and the mouse
    # does not reach the window. Nothing on the screen can be judged until the person unlocks it.
    $session = (Get-Process -Id $PID).SessionId
    $locked = @(Get-Process LogonUI -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session }).Count -gt 0
    [ordered]@{ locked = $locked; foreground = [int64][Cap]::GetForegroundWindow() } | ConvertTo-Json -Compress
  }
  'rect' { Get-Geometry (Get-Handle) | ConvertTo-Json -Compress }
  'place' {
    $h = Get-Handle
    $active = Set-Active $h $true
    Start-Sleep -Milliseconds 300
    $geometry = Get-Geometry $h
    $geometry['active'] = $active
    $geometry | ConvertTo-Json -Compress
  }
  'capture' {
    $h = Get-Handle
    $active = Set-Active $h ($PSBoundParameters.ContainsKey('X'))
    Start-Sleep -Milliseconds 700
    $g = Get-Geometry $h
    $bmp = Copy-Screen $g.clientLeft $g.clientTop $g.clientWidth $g.clientHeight
    $bmp.Save($Out)
    $pixels = [ordered]@{}
    foreach ($point in ($Points -split ';' | Where-Object { $_ })) {
      $name, $px, $py = $point -split ':'
      $color = $bmp.GetPixel([int]$px, [int]$py)
      $pixels[$name] = @($color.R, $color.G, $color.B)
    }
    $bmp.Dispose()
    # Active at the moment of the copy, too: something else may have taken the foreground meanwhile.
    $still = [Cap]::GetForegroundWindow() -eq $h
    [ordered]@{ width = $g.clientWidth; height = $g.clientHeight; active = ($active -and $still); pixels = $pixels } | ConvertTo-Json -Compress -Depth 4
  }
  'region' {
    $bmp = Copy-Screen $X $Y $Width $Height
    $bmp.Save($Out)
    $changed = $null
    if ($Compare) {
      $before = New-Object System.Drawing.Bitmap $Compare
      $changed = 0
      for ($px = 0; $px -lt $Width; $px += 2) { for ($py = 0; $py -lt $Height; $py += 2) {
        $a = $bmp.GetPixel($px, $py); $b = $before.GetPixel($px, $py)
        if ([Math]::Abs($a.R - $b.R) + [Math]::Abs($a.G - $b.G) + [Math]::Abs($a.B - $b.B) -gt 24) { $changed++ }
      } }
      $before.Dispose()
    }
    $bmp.Dispose()
    [ordered]@{ width = $Width; height = $Height; sampled = [int]($Width / 2) * [int]($Height / 2); changed = $changed } | ConvertTo-Json -Compress
  }
  'move' {
    # The mouse goes where it is told, then one pixel away and back, so the window sees real movement over the
    # spot (Windows 11 offers its Snap Layouts after the pointer rests on the maximize button).
    [Cap]::SetCursorPos($X, $Y) | Out-Null
    Start-Sleep -Milliseconds 80
    [Cap]::SetCursorPos($X + 1, $Y) | Out-Null
    Start-Sleep -Milliseconds 80
    [Cap]::SetCursorPos($X, $Y) | Out-Null
    Start-Sleep -Milliseconds 80
    [ordered]@{ x = $X; y = $Y; at = (Get-Cursor) } | ConvertTo-Json -Compress
  }
  'click' {
    # A click only where the pointer is: someone moving the mouse meanwhile must not press another button.
    [Cap]::SetCursorPos($X, $Y) | Out-Null
    Start-Sleep -Milliseconds 120
    $at = Get-Cursor
    $clicked = ([Math]::Abs($at[0] - $X) -le 2) -and ([Math]::Abs($at[1] - $Y) -le 2)
    if ($clicked) {
      Mouse 0x0002   # left down
      Start-Sleep -Milliseconds 60
      Mouse 0x0004   # left up
    }
    [ordered]@{ clicked = $clicked; x = $X; y = $Y; at = $at } | ConvertTo-Json -Compress
  }
}
