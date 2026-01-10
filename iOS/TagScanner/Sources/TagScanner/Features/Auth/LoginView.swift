import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authService: AuthService
    
    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color(hex: "0a0a0f"),
                    Color(hex: "12121a"),
                    Color(hex: "1a1a24")
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            
            VStack(spacing: 40) {
                Spacer()
                
                // App Icon and Title
                VStack(spacing: 20) {
                    // Icon
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: "6366f1"), Color(hex: "a855f7")],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 100, height: 100)
                        
                        Image(systemName: "tag.fill")
                            .font(.system(size: 44, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    .shadow(color: Color(hex: "6366f1").opacity(0.4), radius: 20, y: 10)
                    
                    // Title
                    Text("Free Time")
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    
                    Text("Scan clothing tags to discover\nvalue and market insights")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundColor(Color(hex: "8888a0"))
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)
                }
                
                Spacer()
                
                // Sign In Button
                VStack(spacing: 16) {
                    Button {
                        Task {
                            await authService.login()
                        }
                    } label: {
                        HStack(spacing: 12) {
                            if authService.isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            } else {
                                Image(systemName: "person.badge.key.fill")
                                    .font(.system(size: 18, weight: .semibold))
                            }
                            
                            Text("Sign In")
                                .font(.system(size: 18, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(
                            LinearGradient(
                                colors: [Color(hex: "6366f1"), Color(hex: "818cf8")],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .cornerRadius(16)
                    }
                    .disabled(authService.isLoading)
                    
                    // Error message
                    if let error = authService.error {
                        Text(error.localizedDescription)
                            .font(.system(size: 14))
                            .foregroundColor(Color(hex: "ef4444"))
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 60)
            }
        }
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

#Preview {
    LoginView()
        .environmentObject(AuthService())
}

