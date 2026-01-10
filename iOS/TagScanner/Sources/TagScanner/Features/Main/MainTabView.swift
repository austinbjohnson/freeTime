import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var convexService: ConvexService
    @State private var selectedTab = 0
    
    var body: some View {
        TabView(selection: $selectedTab) {
            // Camera Tab
            CameraView()
                .tabItem {
                    Image(systemName: "camera.fill")
                    Text("Scan")
                }
                .tag(0)
            
            // Scans Tab
            ScanListView()
                .tabItem {
                    Image(systemName: "list.bullet.rectangle.fill")
                    Text("Scans")
                }
                .tag(1)
            
            // Profile Tab
            ProfileView()
                .tabItem {
                    Image(systemName: "person.fill")
                    Text("Profile")
                }
                .tag(2)
        }
        .tint(Color(hex: "6366f1"))
        .onAppear {
            // Customize tab bar appearance
            let appearance = UITabBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor(Color(hex: "0a0a0f"))
            
            UITabBar.appearance().standardAppearance = appearance
            UITabBar.appearance().scrollEdgeAppearance = appearance
        }
        .task {
            // Sync user to Convex on app launch
            if let workosUser = authService.workosUser {
                do {
                    _ = try await convexService.syncUser(
                        workosId: workosUser.id,
                        email: workosUser.email,
                        firstName: workosUser.firstName,
                        lastName: workosUser.lastName,
                        avatarUrl: workosUser.profilePictureUrl
                    )
                } catch {
                    print("Failed to sync user: \(error)")
                }
            }
        }
    }
}

// MARK: - Profile View

struct ProfileView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var convexService: ConvexService
    
    var body: some View {
        NavigationStack {
            ZStack {
                Color(hex: "0a0a0f")
                    .ignoresSafeArea()
                
                VStack(spacing: 32) {
                    // Profile Header
                    VStack(spacing: 16) {
                        // Avatar
                        if let avatarUrl = authService.workosUser?.profilePictureUrl,
                           let url = URL(string: avatarUrl) {
                            AsyncImage(url: url) { image in
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                            } placeholder: {
                                Circle()
                                    .fill(Color(hex: "6366f1"))
                                    .overlay {
                                        Text(initials)
                                            .font(.system(size: 32, weight: .semibold))
                                            .foregroundColor(.white)
                                    }
                            }
                            .frame(width: 100, height: 100)
                            .clipShape(Circle())
                        } else {
                            Circle()
                                .fill(Color(hex: "6366f1"))
                                .frame(width: 100, height: 100)
                                .overlay {
                                    Text(initials)
                                        .font(.system(size: 32, weight: .semibold))
                                        .foregroundColor(.white)
                                }
                        }
                        
                        // Name and email
                        VStack(spacing: 4) {
                            Text(displayName)
                                .font(.system(size: 24, weight: .semibold))
                                .foregroundColor(.white)
                            
                            Text(authService.workosUser?.email ?? "")
                                .font(.system(size: 16))
                                .foregroundColor(Color(hex: "8888a0"))
                        }
                    }
                    .padding(.top, 40)
                    
                    // Stats
                    HStack(spacing: 40) {
                        statItem(value: "\(convexService.scans.count)", label: "Scans")
                        statItem(value: "\(completedScans)", label: "Completed")
                    }
                    
                    Spacer()
                    
                    // Sign Out Button
                    Button {
                        authService.logout()
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                            Text("Sign Out")
                        }
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(Color(hex: "ef4444"))
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Color(hex: "ef4444").opacity(0.1))
                        .cornerRadius(12)
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color(hex: "0a0a0f"), for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }
    
    private func statItem(value: String, label: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.white)
            
            Text(label)
                .font(.system(size: 14))
                .foregroundColor(Color(hex: "8888a0"))
        }
    }
    
    private var displayName: String {
        if let first = authService.workosUser?.firstName,
           let last = authService.workosUser?.lastName {
            return "\(first) \(last)"
        } else if let first = authService.workosUser?.firstName {
            return first
        } else {
            return authService.workosUser?.email ?? "User"
        }
    }
    
    private var initials: String {
        let first = authService.workosUser?.firstName?.first.map(String.init) ?? ""
        let last = authService.workosUser?.lastName?.first.map(String.init) ?? ""
        return "\(first)\(last)".uppercased()
    }
    
    private var completedScans: Int {
        convexService.scans.filter { $0.status == .completed }.count
    }
}

#Preview {
    MainTabView()
        .environmentObject(AuthService())
        .environmentObject(ConvexService())
}

