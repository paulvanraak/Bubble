import SwiftUI

@main
struct BubbleNotesApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            PreferencesView(edgeController: appDelegate.edgeController)
        }
    }
}
