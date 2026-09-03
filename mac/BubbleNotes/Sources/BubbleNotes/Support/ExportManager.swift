import AppKit
import Foundation

enum ExportManager {
    static func exportSingle(_ note: Note) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = (note.title.isEmpty ? "Note" : note.title) + ".md"
        panel.allowsOtherFileTypes = true
        panel.begin { result in
            guard result == .OK, let url = panel.url else { return }
            write(note: note, to: url)
        }
    }

    static func exportAll(_ notes: [Note]) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.prompt = "Export"
        panel.message = "Choose a folder to export all notes into"
        panel.begin { result in
            guard result == .OK, let dir = panel.url else { return }
            for note in notes {
                let name = sanitizedFileName(note.title.isEmpty ? "Untitled" : note.title)
                let fileURL = dir.appendingPathComponent("\(name)-\(note.id.uuidString.prefix(6)).md")
                write(note: note, to: fileURL)
            }
        }
    }

    private static func write(note: Note, to url: URL) {
        let title = note.title.isEmpty ? "Untitled" : note.title
        let text = "# \(title)\n\n\(note.body)\n"
        try? text.write(to: url, atomically: true, encoding: .utf8)
    }

    private static func sanitizedFileName(_ name: String) -> String {
        let invalid = CharacterSet(charactersIn: "/\\:*?\"<>|")
        return name.components(separatedBy: invalid).joined(separator: "-")
    }
}
