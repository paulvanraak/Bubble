import SwiftUI

struct PreferencesView: View {
    @ObservedObject var edgeController: EdgeNotesController

    var body: some View {
        Form {
            Picker(
                "Notes edge",
                selection: Binding(
                    get: { edgeController.edge },
                    set: { edgeController.setEdge($0) }
                )
            ) {
                ForEach(EdgeSide.allCases) { side in
                    Text(side.label).tag(side)
                }
            }
            .pickerStyle(.radioGroup)
        }
        .padding(20)
        .frame(width: 280)
    }
}
