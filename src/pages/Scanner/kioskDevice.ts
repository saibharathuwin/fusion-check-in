const KIOSK_DEVICE_STORAGE_KEY = 'fusion-scanner-kiosk-device-v1'

// Set once when signing in through the dedicated /kiosk login (KioskLoginPage), cleared when a
// staff member signs in personally via /scanner/login instead — lets ScannerPage show a warmer,
// public-facing check-in message for the shared kiosk account without a separate manual
// "Kiosk Mode" toggle to turn on and off.
export function markKioskDevice() {
  try {
    localStorage.setItem(KIOSK_DEVICE_STORAGE_KEY, 'true')
  } catch {
    // Worst case this device just shows the regular staff-style message instead of the kiosk one.
  }
}

export function clearKioskDevice() {
  try {
    localStorage.removeItem(KIOSK_DEVICE_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function isKioskDevice(): boolean {
  try {
    return localStorage.getItem(KIOSK_DEVICE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}
