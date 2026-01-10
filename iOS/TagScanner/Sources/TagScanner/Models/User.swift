import Foundation

/// Represents an authenticated user
struct User: Identifiable, Codable {
    let id: String
    let workosId: String
    let email: String
    var firstName: String?
    var lastName: String?
    var avatarUrl: String?
    
    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case workosId
        case email
        case firstName
        case lastName
        case avatarUrl
    }
    
    var displayName: String {
        if let first = firstName, let last = lastName {
            return "\(first) \(last)"
        } else if let first = firstName {
            return first
        } else {
            return email
        }
    }
    
    var initials: String {
        let first = firstName?.first.map(String.init) ?? ""
        let last = lastName?.first.map(String.init) ?? ""
        return "\(first)\(last)".uppercased()
    }
}

