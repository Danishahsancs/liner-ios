import UIKit
import CarPlay
import Capacitor

// CarPlay for Liner. The car screen is native CarPlay templates, but all data
// and playback live in the web app: src/features/carplay pushes the lists in
// through CarPlayPlugin and gets "select" / "browse" events back. CarPlay can
// connect while the phone UI isn't running (no web view yet), so until the web
// app has sent its lists the car shows a hint to open Liner on the phone.

// MARK: - Bridge view controller (registers in-app plugins)

class LinerBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CarPlayPlugin())
    }
}

// MARK: - Data sent from JS

struct CarPlayItem {
    let id: String
    let title: String
    let subtitle: String?
    let artworkUrl: String?
    // opens a sub-list (playlist) instead of starting playback
    let browsable: Bool

    init?(_ obj: JSObject) {
        guard let id = obj["id"] as? String, let title = obj["title"] as? String else { return nil }
        self.id = id
        self.title = title
        subtitle = obj["subtitle"] as? String
        artworkUrl = obj["artworkUrl"] as? String
        browsable = obj["browsable"] as? Bool ?? false
    }
}

struct CarPlayList {
    let id: String
    let title: String
    let systemImage: String?
    let emptyText: String?
    let items: [CarPlayItem]

    init?(_ obj: JSObject) {
        guard let id = obj["id"] as? String else { return nil }
        self.id = id
        title = obj["title"] as? String ?? ""
        systemImage = obj["systemImage"] as? String
        emptyText = obj["emptyText"] as? String
        items = (obj["items"] as? JSArray ?? []).compactMap { ($0 as? JSObject).flatMap(CarPlayItem.init) }
    }
}

// MARK: - Plugin (JS <-> native)

@objc(CarPlayPlugin)
public class CarPlayPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CarPlayPlugin"
    public let jsName = "LinerCarPlay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRoot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showList", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        DispatchQueue.main.async { CarPlayHub.shared.plugin = self }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["connected": CarPlayHub.shared.isConnected])
        }
    }

    // tabs shown at the root of the car screen (max 4 for audio apps)
    @objc func setRoot(_ call: CAPPluginCall) {
        let tabs = (call.getArray("tabs") ?? []).compactMap { ($0 as? JSObject).flatMap(CarPlayList.init) }
        DispatchQueue.main.async {
            CarPlayHub.shared.setRoot(tabs)
            call.resolve()
        }
    }

    // answer to a "browse" event: fills the list pushed for that request
    @objc func showList(_ call: CAPPluginCall) {
        guard let requestId = call.getString("requestId"),
              let list = call.getObject("list").flatMap(CarPlayList.init) else {
            call.reject("requestId and list are required")
            return
        }
        DispatchQueue.main.async {
            CarPlayHub.shared.showList(requestId: requestId, list: list)
            call.resolve()
        }
    }

    func emit(_ event: String, _ data: [String: Any]) {
        notifyListeners(event, data: data, retainUntilConsumed: false)
    }
}

// MARK: - Template state (main thread only)

final class CarPlayHub {
    static let shared = CarPlayHub()

    weak var plugin: CarPlayPlugin?
    private var interfaceController: CPInterfaceController?
    private var tabs: [CarPlayList] = []
    private var tabTemplates: [String: CPListTemplate] = [:]
    private var tabOrder: [String] = []
    private var pending: [String: CPListTemplate] = [:]
    private let images = NSCache<NSString, UIImage>()
    private let placeholder = UIImage(systemName: "music.note")

    var isConnected: Bool { interfaceController != nil }

    func connect(_ controller: CPInterfaceController) {
        interfaceController = controller
        controller.setRootTemplate(makeRoot(), animated: false, completion: nil)
        plugin?.emit("connected", ["connected": true])
    }

    func disconnect() {
        interfaceController = nil
        tabTemplates = [:]
        tabOrder = []
        pending.removeAll()
        plugin?.emit("connected", ["connected": false])
    }

    func setRoot(_ newTabs: [CarPlayList]) {
        tabs = newTabs
        guard let controller = interfaceController else { return }
        // same tabs as on screen: refresh in place so a pushed playlist or the
        // now playing screen isn't popped by a background library refresh
        if !tabOrder.isEmpty && tabOrder == newTabs.map(\.id) {
            for tab in newTabs {
                tabTemplates[tab.id]?.updateSections(sections(for: tab))
            }
            return
        }
        controller.setRootTemplate(makeRoot(), animated: false, completion: nil)
    }

    func showList(requestId: String, list: CarPlayList) {
        guard let template = pending.removeValue(forKey: requestId) else { return }
        template.emptyViewTitleVariants = [list.emptyText ?? "Nothing here yet"]
        template.updateSections(sections(for: list))
    }

    private func makeRoot() -> CPTemplate {
        tabTemplates = [:]
        tabOrder = []
        guard !tabs.isEmpty else {
            let hint = CPListItem(text: "Open Liner on your iPhone",
                                  detailText: "Your library shows up here once the app is running")
            return CPListTemplate(title: "Liner", sections: [CPListSection(items: [hint])])
        }
        let templates: [CPListTemplate] = tabs.prefix(4).map { tab in
            let template = CPListTemplate(title: tab.title, sections: sections(for: tab))
            template.tabTitle = tab.title
            template.tabImage = UIImage(systemName: tab.systemImage ?? "music.note.list")
            template.emptyViewTitleVariants = [tab.emptyText ?? "Nothing here yet"]
            tabTemplates[tab.id] = template
            tabOrder.append(tab.id)
            return template
        }
        return CPTabBarTemplate(templates: templates)
    }

    private func sections(for list: CarPlayList) -> [CPListSection] {
        let items = list.items.prefix(CPListTemplate.maximumItemCount).map { makeItem($0, listId: list.id) }
        return [CPListSection(items: Array(items))]
    }

    private func makeItem(_ item: CarPlayItem, listId: String) -> CPListItem {
        let listItem = CPListItem(text: item.title, detailText: item.subtitle, image: placeholder)
        listItem.accessoryType = item.browsable ? .disclosureIndicator : .none
        listItem.handler = { [weak self] _, completion in
            self?.handleSelect(item, listId: listId)
            completion()
        }
        if let url = item.artworkUrl {
            loadImage(url) { [weak listItem] image in listItem?.setImage(image) }
        }
        return listItem
    }

    private func handleSelect(_ item: CarPlayItem, listId: String) {
        guard let controller = interfaceController else { return }
        if item.browsable {
            let requestId = UUID().uuidString
            let template = CPListTemplate(title: item.title, sections: [])
            template.emptyViewTitleVariants = ["Loading…"]
            pending[requestId] = template
            controller.pushTemplate(template, animated: true, completion: nil)
            plugin?.emit("browse", ["requestId": requestId, "listId": listId, "itemId": item.id])
        } else {
            plugin?.emit("select", ["listId": listId, "itemId": item.id])
            if controller.topTemplate !== CPNowPlayingTemplate.shared {
                controller.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil)
            }
        }
    }

    private func loadImage(_ urlString: String, completion: @escaping (UIImage) -> Void) {
        if let cached = images.object(forKey: urlString as NSString) {
            completion(cached)
            return
        }
        guard let url = URL(string: urlString) else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data = data, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                self?.images.setObject(image, forKey: urlString as NSString)
                completion(image)
            }
        }.resume()
    }
}

// MARK: - CarPlay scene

class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController) {
        CarPlayHub.shared.connect(interfaceController)
    }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        CarPlayHub.shared.disconnect()
    }
}
