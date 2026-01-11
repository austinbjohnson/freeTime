import Foundation

/// Minimal Convex WebSocket client for query subscriptions.
final class ConvexRealtimeClient: NSObject {
    typealias UpdateHandler = (Any?) -> Void
    typealias ErrorHandler = (String) -> Void
    
    private struct Subscription {
        let id: Int
        let path: String
        let args: [String: Any]
        let onUpdate: UpdateHandler
        let onError: ErrorHandler?
    }
    
    private struct TransitionChunkBuffer {
        var chunks: [String]
        let totalParts: Int
        let transitionId: String
    }
    
    private let webSocketURL: URL
    private let session: URLSession
    
    private var webSocketTask: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var reconnectWorkItem: DispatchWorkItem?
    
    private var subscriptions: [Int: Subscription] = [:]
    private var nextQueryId = 0
    private var querySetVersion = 0
    
    private var connectionCount = 0
    private var sessionId = UUID().uuidString
    private var lastCloseReason: String? = "InitialConnect"
    private var reconnectDelay: TimeInterval = 1
    private var isManuallyClosed = false
    private var transitionChunkBuffer: TransitionChunkBuffer?
    private let stateLock = NSLock()
    
    init(baseURL: URL, clientVersion: String = "1.31.3") {
        guard let wsURL = Self.buildWebSocketURL(from: baseURL, version: clientVersion) else {
            fatalError("Invalid Convex base URL for WebSocket client.")
        }
        self.webSocketURL = wsURL
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 180
        self.session = URLSession(configuration: config, delegate: nil, delegateQueue: nil)
        super.init()
    }
    
    deinit {
        disconnect()
        session.invalidateAndCancel()
    }
    
    func connect() {
        stateLock.lock()
        if webSocketTask != nil {
            stateLock.unlock()
            return
        }
        isManuallyClosed = false
        reconnectDelay = 1
        querySetVersion = 0
        transitionChunkBuffer = nil
        let task = session.webSocketTask(with: webSocketURL)
        webSocketTask = task
        stateLock.unlock()
        task.resume()
        startReceiveLoop()
        
        connectionCount += 1
        sendConnect()
        sendFullQuerySet()
    }
    
    func disconnect() {
        stateLock.lock()
        isManuallyClosed = true
        let task = webSocketTask
        webSocketTask = nil
        stateLock.unlock()
        
        receiveTask?.cancel()
        reconnectWorkItem?.cancel()
        task?.cancel(with: .normalClosure, reason: nil)
    }
    
    @discardableResult
    func subscribe(path: String, args: [String: Any], onUpdate: @escaping UpdateHandler, onError: ErrorHandler? = nil) -> Int {
        let queryId = nextQueryId
        nextQueryId += 1
        let subscription = Subscription(id: queryId, path: path, args: args, onUpdate: onUpdate, onError: onError)
        stateLock.lock()
        subscriptions[queryId] = subscription
        stateLock.unlock()
        
        sendAddQuery(subscription)
        return queryId
    }
    
    func unsubscribe(queryId: Int) {
        stateLock.lock()
        subscriptions.removeValue(forKey: queryId)
        stateLock.unlock()
        sendRemoveQuery(queryId: queryId)
    }
    
    // MARK: - WebSocket Receive Loop
    
    private func startReceiveLoop() {
        receiveTask?.cancel()
        receiveTask = Task { [weak self] in
            await self?.receiveLoop()
        }
    }
    
    private func receiveLoop() async {
        while !Task.isCancelled {
            guard let task = webSocketTask else { return }
            do {
                let message = try await task.receive()
                switch message {
                case .string(let text):
                    handleIncomingText(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        handleIncomingText(text)
                    }
                @unknown default:
                    break
                }
            } catch {
                handleReceiveError(error)
                return
            }
        }
    }
    
    private func handleReceiveError(_ error: Error) {
        stateLock.lock()
        lastCloseReason = error.localizedDescription
        stateLock.unlock()
        print("[ConvexRealtime] Receive error: \(error.localizedDescription)")
        scheduleReconnect()
    }
    
    // MARK: - Message Handling
    
    private func handleIncomingText(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        handleServerMessage(json)
    }
    
    private func handleServerMessage(_ message: [String: Any]) {
        guard let type = message["type"] as? String else { return }
        switch type {
        case "Ping":
            return
        case "TransitionChunk":
            if let full = assembleTransitionChunk(message) {
                handleIncomingText(full)
            }
        case "Transition":
            handleTransition(message)
        case "AuthError", "FatalError":
            let errorMessage = message["error"] as? String ?? "Unknown Convex error"
            broadcastError(errorMessage)
        default:
            break
        }
    }
    
    private func handleTransition(_ message: [String: Any]) {
        guard let modifications = message["modifications"] as? [[String: Any]] else { return }
        for modification in modifications {
            guard let type = modification["type"] as? String else { continue }
            switch type {
            case "QueryUpdated":
                let queryId = parseQueryId(modification["queryId"])
                guard let queryId else { continue }
                let value = modification["value"]
                dispatchUpdate(queryId: queryId, value: value is NSNull ? nil : value)
            case "QueryFailed":
                let queryId = parseQueryId(modification["queryId"])
                guard let queryId else { continue }
                let errorMessage = modification["errorMessage"] as? String ?? "Query failed"
                dispatchError(queryId: queryId, message: errorMessage)
            default:
                break
            }
        }
    }
    
    private func parseQueryId(_ value: Any?) -> Int? {
        if let intValue = value as? Int {
            return intValue
        }
        if let number = value as? NSNumber {
            return number.intValue
        }
        return nil
    }
    
    private func dispatchUpdate(queryId: Int, value: Any?) {
        var subscription: Subscription?
        stateLock.lock()
        subscription = subscriptions[queryId]
        stateLock.unlock()
        subscription?.onUpdate(value)
    }
    
    private func dispatchError(queryId: Int, message: String) {
        var subscription: Subscription?
        stateLock.lock()
        subscription = subscriptions[queryId]
        stateLock.unlock()
        subscription?.onError?(message)
    }
    
    private func broadcastError(_ message: String) {
        let currentSubscriptions: [Subscription]
        stateLock.lock()
        currentSubscriptions = Array(subscriptions.values)
        stateLock.unlock()
        for subscription in currentSubscriptions {
            subscription.onError?(message)
        }
    }
    
    private func assembleTransitionChunk(_ message: [String: Any]) -> String? {
        guard let chunk = message["chunk"] as? String,
              let partNumber = parseQueryId(message["partNumber"]),
              let totalParts = parseQueryId(message["totalParts"]),
              let transitionId = message["transitionId"] as? String else {
            return nil
        }
        
        if partNumber < 0 || partNumber >= totalParts || totalParts == 0 {
            transitionChunkBuffer = nil
            return nil
        }
        
        if transitionChunkBuffer == nil {
            transitionChunkBuffer = TransitionChunkBuffer(
                chunks: [],
                totalParts: totalParts,
                transitionId: transitionId
            )
        }
        
        guard var buffer = transitionChunkBuffer else { return nil }
        if buffer.totalParts != totalParts || buffer.transitionId != transitionId {
            transitionChunkBuffer = nil
            return nil
        }
        
        if partNumber != buffer.chunks.count {
            transitionChunkBuffer = nil
            return nil
        }
        
        buffer.chunks.append(chunk)
        if buffer.chunks.count == totalParts {
            transitionChunkBuffer = nil
            return buffer.chunks.joined()
        }
        transitionChunkBuffer = buffer
        return nil
    }
    
    // MARK: - Message Sending
    
    private func sendConnect() {
        let message: [String: Any] = [
            "type": "Connect",
            "sessionId": sessionId,
            "connectionCount": connectionCount,
            "lastCloseReason": lastCloseReason ?? NSNull(),
            "clientTs": Int(Date().timeIntervalSince1970 * 1000)
        ]
        send(message)
    }
    
    private func sendFullQuerySet() {
        let subs: [Subscription]
        stateLock.lock()
        subs = Array(subscriptions.values)
        stateLock.unlock()
        
        guard !subs.isEmpty else { return }
        querySetVersion = 1
        
        let modifications = subs.map { sub -> [String: Any] in
            [
                "type": "Add",
                "queryId": sub.id,
                "udfPath": sub.path,
                "args": [sub.args]
            ]
        }
        
        let message: [String: Any] = [
            "type": "ModifyQuerySet",
            "baseVersion": 0,
            "newVersion": querySetVersion,
            "modifications": modifications
        ]
        send(message)
    }
    
    private func sendAddQuery(_ subscription: Subscription) {
        guard webSocketTask != nil else { return }
        let baseVersion = querySetVersion
        querySetVersion += 1
        let modification: [String: Any] = [
            "type": "Add",
            "queryId": subscription.id,
            "udfPath": subscription.path,
            "args": [subscription.args]
        ]
        let message: [String: Any] = [
            "type": "ModifyQuerySet",
            "baseVersion": baseVersion,
            "newVersion": querySetVersion,
            "modifications": [modification]
        ]
        send(message)
    }
    
    private func sendRemoveQuery(queryId: Int) {
        guard webSocketTask != nil else { return }
        let baseVersion = querySetVersion
        querySetVersion += 1
        let modification: [String: Any] = [
            "type": "Remove",
            "queryId": queryId
        ]
        let message: [String: Any] = [
            "type": "ModifyQuerySet",
            "baseVersion": baseVersion,
            "newVersion": querySetVersion,
            "modifications": [modification]
        ]
        send(message)
    }
    
    private func send(_ message: [String: Any]) {
        guard let task = webSocketTask else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let text = String(data: data, encoding: .utf8) else { return }
        task.send(.string(text)) { error in
            if let error {
                print("[ConvexRealtime] Send error: \(error.localizedDescription)")
            }
        }
    }
    
    // MARK: - Reconnect
    
    private func scheduleReconnect() {
        stateLock.lock()
        let shouldReconnect = !isManuallyClosed
        stateLock.unlock()
        guard shouldReconnect else { return }
        
        reconnectWorkItem?.cancel()
        let delay = min(reconnectDelay, 30)
        let workItem = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.stateLock.lock()
            self.webSocketTask = nil
            self.stateLock.unlock()
            self.connect()
        }
        reconnectWorkItem = workItem
        DispatchQueue.global().asyncAfter(deadline: .now() + delay, execute: workItem)
        reconnectDelay = min(reconnectDelay * 2, 30)
    }
    
    // MARK: - Helpers
    
    private static func buildWebSocketURL(from baseURL: URL, version: String) -> URL? {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            return nil
        }
        switch components.scheme {
        case "http":
            components.scheme = "ws"
        case "https":
            components.scheme = "wss"
        default:
            return nil
        }
        components.path = "/api/\(version)/sync"
        components.query = nil
        return components.url
    }
}
