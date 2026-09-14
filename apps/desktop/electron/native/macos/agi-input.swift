// The mouse and keyboard half of desktop computer use on macOS.
//
// Electron can capture the screen but cannot synthesise input, so this helper
// owns the CGEvent calls. It reads one JSON request per line on stdin and
// writes one JSON reply per line on stdout, which lets a single long-lived
// process serve a whole session: the Accessibility grant is checked once by the
// app, and the pointer keeps the state a drag depends on between calls.
//
// It decides nothing. Every request has already passed the device-step contract
// and the user's computer.use grant before it reaches here.

import CoreGraphics
import Foundation

let keyCodes: [String: CGKeyCode] = [
  "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
  "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
  "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26,
  "-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35,
  "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43, "/": 44,
  "n": 45, "m": 46, ".": 47, "`": 50,
  "enter": 36, "tab": 48, "space": 49, "backspace": 51, "escape": 53, "delete": 117,
  "home": 115, "end": 119, "pageup": 116, "pagedown": 121,
  "left": 123, "right": 124, "down": 125, "up": 126,
  "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97,
  "f7": 98, "f8": 100, "f9": 101, "f10": 109, "f11": 103, "f12": 111,
]

let modifierFlags: [String: CGEventFlags] = [
  "command": .maskCommand,
  "control": .maskControl,
  "option": .maskAlternate,
  "shift": .maskShift,
]

struct Failure: Error {
  let message: String
}

func source() throws -> CGEventSource {
  guard let made = CGEventSource(stateID: .combinedSessionState) else {
    throw Failure(message: "macOS refused an event source; check Accessibility permission.")
  }
  return made
}

func number(_ request: [String: Any], _ key: String) throws -> Double {
  guard let value = request[key] as? NSNumber else {
    throw Failure(message: "\"\(key)\" must be a number.")
  }
  return value.doubleValue
}

func point(_ request: [String: Any], _ xKey: String, _ yKey: String) throws -> CGPoint {
  CGPoint(x: try number(request, xKey), y: try number(request, yKey))
}

func post(_ event: CGEvent?) throws {
  guard let event else {
    throw Failure(message: "macOS refused to build the event.")
  }
  event.post(tap: .cghidEventTap)
}

func settle(_ seconds: Double = 0.012) {
  Thread.sleep(forTimeInterval: seconds)
}

func moveMouse(to target: CGPoint) throws {
  try post(
    CGEvent(
      mouseEventSource: try source(), mouseType: .mouseMoved, mouseCursorPosition: target,
      mouseButton: .left))
}

func click(at target: CGPoint, button: String, count: Int) throws {
  let isRight = button == "right"
  let down: CGEventType = isRight ? .rightMouseDown : .leftMouseDown
  let up: CGEventType = isRight ? .rightMouseUp : .leftMouseUp
  let which: CGMouseButton = isRight ? .right : .left

  try moveMouse(to: target)
  settle()
  for press in 1...count {
    guard
      let downEvent = CGEvent(
        mouseEventSource: try source(), mouseType: down, mouseCursorPosition: target,
        mouseButton: which),
      let upEvent = CGEvent(
        mouseEventSource: try source(), mouseType: up, mouseCursorPosition: target,
        mouseButton: which)
    else {
      throw Failure(message: "macOS refused to build the click.")
    }
    // A double or triple click is one click with a rising click count, not two
    // separate clicks: without this every app reads them as unrelated presses.
    downEvent.setIntegerValueField(.mouseEventClickState, value: Int64(press))
    upEvent.setIntegerValueField(.mouseEventClickState, value: Int64(press))
    downEvent.post(tap: .cghidEventTap)
    upEvent.post(tap: .cghidEventTap)
    settle(0.04)
  }
}

func drag(from start: CGPoint, to end: CGPoint) throws {
  try moveMouse(to: start)
  settle(0.05)
  try post(
    CGEvent(
      mouseEventSource: try source(), mouseType: .leftMouseDown, mouseCursorPosition: start,
      mouseButton: .left))
  settle(0.05)
  let steps = 24
  for step in 1...steps {
    let progress = Double(step) / Double(steps)
    let waypoint = CGPoint(
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress)
    try post(
      CGEvent(
        mouseEventSource: try source(), mouseType: .leftMouseDragged,
        mouseCursorPosition: waypoint, mouseButton: .left))
    settle(0.008)
  }
  settle(0.05)
  try post(
    CGEvent(
      mouseEventSource: try source(), mouseType: .leftMouseUp, mouseCursorPosition: end,
      mouseButton: .left))
}

func scroll(at target: CGPoint, deltaX: Double, deltaY: Double) throws {
  try moveMouse(to: target)
  settle()
  // The contract reads like a page: a positive deltaY moves the content up the
  // screen. CGEvent's wheel axis runs the other way, so it is negated here.
  guard
    let event = CGEvent(
      scrollWheelEvent2Source: try source(), units: .pixel, wheelCount: 2,
      wheel1: Int32(-deltaY), wheel2: Int32(-deltaX), wheel3: 0)
  else {
    throw Failure(message: "macOS refused to build the scroll.")
  }
  event.post(tap: .cghidEventTap)
}

func typeUnicode(_ text: String) throws {
  // CGEventKeyboardSetUnicodeString reaches its limit well before a long
  // paragraph, so the text goes in small chunks; a newline is a real return
  // keypress because a bare \n is ignored by most text fields.
  for line in text.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
    if line.offset > 0 {
      try pressKey("enter", modifiers: [])
      settle(0.02)
    }
    let units = Array(String(line.element).utf16)
    var index = 0
    while index < units.count {
      let chunk = Array(units[index..<min(index + 16, units.count)])
      guard
        let down = CGEvent(keyboardEventSource: try source(), virtualKey: 0, keyDown: true),
        let up = CGEvent(keyboardEventSource: try source(), virtualKey: 0, keyDown: false)
      else {
        throw Failure(message: "macOS refused to build the keystroke.")
      }
      down.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: chunk)
      up.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: chunk)
      down.post(tap: .cghidEventTap)
      up.post(tap: .cghidEventTap)
      settle(0.012)
      index += chunk.count
    }
  }
}

func pressKey(_ key: String, modifiers: [String]) throws {
  var flags: CGEventFlags = []
  for modifier in modifiers {
    guard let flag = modifierFlags[modifier] else {
      throw Failure(message: "\"\(modifier)\" is not a modifier this device holds.")
    }
    flags.insert(flag)
  }

  guard let code = keyCodes[key] else {
    if modifiers.isEmpty && key.count == 1 {
      try typeUnicode(key)
      return
    }
    throw Failure(message: "\"\(key)\" is not a key this device can press.")
  }

  guard
    let down = CGEvent(keyboardEventSource: try source(), virtualKey: code, keyDown: true),
    let up = CGEvent(keyboardEventSource: try source(), virtualKey: code, keyDown: false)
  else {
    throw Failure(message: "macOS refused to build the keystroke.")
  }
  down.flags = flags
  up.flags = flags
  down.post(tap: .cghidEventTap)
  settle(0.02)
  up.post(tap: .cghidEventTap)
}

func perform(_ request: [String: Any]) throws {
  guard let action = request["action"] as? String else {
    throw Failure(message: "Every request needs an \"action\".")
  }
  switch action {
  case "ping":
    return
  case "move":
    try moveMouse(to: point(request, "x", "y"))
  case "click":
    let count = (request["count"] as? NSNumber)?.intValue ?? 1
    guard count >= 1 && count <= 3 else {
      throw Failure(message: "\"count\" must be 1, 2 or 3.")
    }
    try click(
      at: point(request, "x", "y"), button: request["button"] as? String ?? "left", count: count)
  case "drag":
    try drag(from: point(request, "x", "y"), to: point(request, "toX", "toY"))
  case "scroll":
    try scroll(
      at: point(request, "x", "y"),
      deltaX: (request["deltaX"] as? NSNumber)?.doubleValue ?? 0,
      deltaY: (request["deltaY"] as? NSNumber)?.doubleValue ?? 0)
  case "type":
    guard let text = request["text"] as? String else {
      throw Failure(message: "A type request needs \"text\".")
    }
    try typeUnicode(text)
  case "key":
    guard let key = request["key"] as? String else {
      throw Failure(message: "A key request needs \"key\".")
    }
    try pressKey(key, modifiers: request["modifiers"] as? [String] ?? [])
  default:
    throw Failure(message: "\"\(action)\" is not an action this device runs.")
  }
}

func reply(_ payload: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
    let line = String(data: data, encoding: .utf8)
  else {
    print("{\"ok\":false,\"error\":\"The reply could not be encoded.\"}")
    fflush(stdout)
    return
  }
  print(line)
  fflush(stdout)
}

while let line = readLine(strippingNewline: true) {
  let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
  if trimmed.isEmpty { continue }
  guard let data = trimmed.data(using: .utf8),
    let request = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  else {
    reply(["ok": false, "error": "That line was not a JSON object."])
    continue
  }
  let id = request["id"] as? NSNumber
  do {
    try perform(request)
    reply(id == nil ? ["ok": true] : ["id": id!, "ok": true])
  } catch let failure as Failure {
    reply(
      id == nil
        ? ["ok": false, "error": failure.message]
        : ["id": id!, "ok": false, "error": failure.message])
  } catch {
    reply(
      id == nil
        ? ["ok": false, "error": "\(error)"]
        : ["id": id!, "ok": false, "error": "\(error)"])
  }
}
