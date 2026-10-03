// Decode a local synthetic MP4 through the same media framework as QuickTime.
// No media bytes or images are written or uploaded.
import Foundation
import AVFoundation
import CoreGraphics

func pixel(_ buffer: CVPixelBuffer) -> [Int] {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
    let offset = (CVPixelBufferGetHeight(buffer) - 15) * CVPixelBufferGetBytesPerRow(buffer) + 10 * 4
    return [Int(base[offset + 2]), Int(base[offset + 1]), Int(base[offset])]
}

func imagePixel(_ image: CGImage) -> [Int] {
    var data = [UInt8](repeating: 0, count: image.width * image.height * 4)
    data.withUnsafeMutableBytes { bytes in
        let context = CGContext(data: bytes.baseAddress, width: image.width, height: image.height,
            bitsPerComponent: 8, bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    }
    let offset = (image.height - 15) * image.width * 4 + 10 * 4
    return [Int(data[offset]), Int(data[offset + 1]), Int(data[offset + 2])]
}

let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let duration = CMTimeGetSeconds(try await asset.load(.duration))
let playable = try await asset.load(.isPlayable)
let track = try await asset.loadTracks(withMediaType: .video).first!
let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(track: track,
    outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(output)
reader.startReading()
var frames = 0
var last: [Int] = []
while let sample = output.copyNextSampleBuffer() {
    frames += 1
    if let buffer = CMSampleBufferGetImageBuffer(sample) { last = pixel(buffer) }
}

// Seek into the ending, then back into gameplay with the native image generator.
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
let boundary = imagePixel(try generator.copyCGImage(at: CMTime(seconds: duration - 2.9, preferredTimescale: 600), actualTime: nil))
let back = imagePixel(try generator.copyCGImage(at: CMTime(seconds: 0.3, preferredTimescale: 600), actualTime: nil))
var audioCompleted = false
if let audio = try await asset.loadTracks(withMediaType: .audio).first {
    let audioReader = try AVAssetReader(asset: asset)
    let audioOutput = AVAssetReaderTrackOutput(track: audio, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM])
    audioReader.add(audioOutput)
    audioReader.startReading()
    var audioSamples = 0
    while audioOutput.copyNextSampleBuffer() != nil { audioSamples += 1 }
    audioCompleted = audioReader.status == .completed && audioSamples > 0
}
let result: [String: Any] = ["playable": playable, "completed": reader.status == .completed,
    "frames": frames, "duration": duration, "last": last, "boundary": boundary, "back": back,
    "audioCompleted": audioCompleted]
let json = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
print(String(data: json, encoding: .utf8)!)
