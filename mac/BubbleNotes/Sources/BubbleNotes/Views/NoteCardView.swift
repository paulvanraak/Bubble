import SwiftUI

struct NoteCardView: View {
    let noteID: UUID
    @ObservedObject var controller: EdgeNotesController
    @EnvironmentObject var store: NoteStore

    @State private var title: String = ""
    @State private var bodyText: String = ""
    @State private var isFavorite: Bool = false
    @State private var didLoad = false

    private var note: Note? { store.note(id: noteID) }
    private var color: NoteColor { note?.color ?? .yellow }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().opacity(0.15)
            TextEditor(text: $bodyText)
                .font(.system(size: 13))
                .scrollContentBackground(.hidden)
                .background(Color.clear)
                .padding(10)
                .onChange(of: bodyText) { _ in commit() }
            Divider().opacity(0.15)
            footer
        }
        .background(color.fill)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.black.opacity(0.12), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.35), radius: 16, x: 0, y: 8)
        .frame(width: Layout.cardWidth, height: Layout.cardHeight)
        .onAppear(perform: load)
        .onHover { hovering in
            if hovering {
                controller.cancelPendingHide()
            } else {
                controller.requestHide(noteID: noteID)
            }
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            HStack(spacing: 5) {
                Circle().fill(Color.black.opacity(0.15)).frame(width: 7, height: 7)
                Circle().fill(Color.black.opacity(0.15)).frame(width: 7, height: 7)
            }
            TextField("Title", text: $title)
                .textFieldStyle(.plain)
                .font(.system(size: 13, weight: .semibold))
                .onChange(of: title) { _ in commit() }
            Spacer()
            Text(savedLabel)
                .font(.system(size: 10))
                .foregroundColor(.black.opacity(0.45))
            Button {
                isFavorite.toggle()
                commit()
            } label: {
                Image(systemName: isFavorite ? "star.fill" : "star")
                    .font(.system(size: 11))
                    .foregroundColor(isFavorite ? .yellow : .black.opacity(0.35))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private var footer: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                ForEach(NoteColor.allCases) { swatch in
                    Circle()
                        .fill(swatch.fill)
                        .frame(width: 16, height: 16)
                        .overlay(
                            Circle().stroke(Color.black.opacity(0.6), lineWidth: swatch == color ? 1.5 : 0)
                        )
                        .onTapGesture { setColor(swatch) }
                }
                Spacer()
            }

            HStack(spacing: 8) {
                Button(role: .destructive, action: delete) {
                    Text("Delete")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                Spacer()

                Button(action: markComplete) {
                    Text(note?.isCompleted == true ? "Completed" : "Mark complete")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                Button(action: { controller.closeCard(noteID: noteID) }) {
                    Text("Close")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(12)
    }

    private var savedLabel: String {
        guard let note else { return "" }
        let interval = Date().timeIntervalSince(note.updatedAt)
        if interval < 5 { return "Saved \u{00B7} now" }
        if interval < 60 { return "Saved \u{00B7} \(Int(interval))s" }
        if interval < 3600 { return "Saved \u{00B7} \(Int(interval / 60))m" }
        return "Saved"
    }

    private func load() {
        guard !didLoad, let note else { return }
        title = note.title
        bodyText = note.body
        isFavorite = note.isFavorite
        didLoad = true
    }

    private func commit() {
        guard var updated = note else { return }
        updated.title = title
        updated.body = bodyText
        updated.isFavorite = isFavorite
        store.update(updated)
    }

    private func setColor(_ swatch: NoteColor) {
        guard var updated = note else { return }
        updated.color = swatch
        store.update(updated)
    }

    private func delete() {
        controller.closeCard(noteID: noteID)
        store.delete(id: noteID)
    }

    private func markComplete() {
        controller.closeCard(noteID: noteID)
        store.setArchived(id: noteID, archived: true)
    }
}
