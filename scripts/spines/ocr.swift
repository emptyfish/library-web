// Usage: ocr <image> — prints JSON lines {text, x0, x1, y0, y1, rot} in original-image pixels.
import Foundation
import Vision
import CoreImage
import ImageIO

let path = CommandLine.arguments[1]
guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { exit(1) }
let W = CGFloat(img.width), H = CGFloat(img.height)
let ctx = CIContext()

func run(_ orient: CGImagePropertyOrientation, _ rot: Int) {
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  req.minimumTextHeight = 0.01
  let handler = VNImageRequestHandler(cgImage: img, orientation: orient, options: [:])
  try? handler.perform([req])
  for obs in req.results ?? [] {
    guard let cand = obs.topCandidates(1).first else { continue }
    // Bounding box is normalized in the *oriented* image space (origin bottom-left).
    let b = obs.boundingBox
    var x0: CGFloat, x1: CGFloat, y0: CGFloat, y1: CGFloat
    if rot == 0 {
      x0 = b.minX * W; x1 = b.maxX * W; y0 = (1 - b.maxY) * H; y1 = (1 - b.minY) * H
    } else if rot == 90 { // .right: oriented image is original rotated 90° clockwise
      // oriented (u,v) top-left origin: u in [0,H], v in [0,W]; original x = v, y = H - u
      let u0 = b.minX * H, u1 = b.maxX * H
      let v0 = (1 - b.maxY) * W, v1 = (1 - b.minY) * W
      x0 = v0; x1 = v1; y0 = H - u1; y1 = H - u0
    } else { // .left: rotated 90° counter-clockwise; original x = W - v, y = u
      let u0 = b.minX * H, u1 = b.maxX * H
      let v0 = (1 - b.maxY) * W, v1 = (1 - b.minY) * W
      x0 = W - v1; x1 = W - v0; y0 = u0; y1 = u1
    }
    let o: [String: Any] = ["text": cand.string, "conf": cand.confidence, "x0": Int(x0), "x1": Int(x1), "y0": Int(y0), "y1": Int(y1), "rot": rot]
    if let d = try? JSONSerialization.data(withJSONObject: o), let s = String(data: d, encoding: .utf8) { print(s) }
  }
}
run(.up, 0)
run(.right, 90)
run(.left, 270)
