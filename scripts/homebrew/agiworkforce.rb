# Homebrew formula for AGI Workforce CLI
# Install: brew install --cask agiworkforce
# Or via tap: brew install siddharthanagula3/tap/agiworkforce

class Agiworkforce < Formula
  desc "Multi-model AI agent for your terminal — BYOK, 24 providers, desktop automation"
  homepage "https://agiworkforce.com"
  license "Proprietary"
  version "0.1.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/siddharthanagula3/agiworkforce-desktop-app/releases/download/v#{version}/agiworkforce-v#{version}-darwin-arm64.tar.gz"
      sha256 "PLACEHOLDER_SHA256_ARM64"
    else
      url "https://github.com/siddharthanagula3/agiworkforce-desktop-app/releases/download/v#{version}/agiworkforce-v#{version}-darwin-x64.tar.gz"
      sha256 "PLACEHOLDER_SHA256_X64"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/siddharthanagula3/agiworkforce-desktop-app/releases/download/v#{version}/agiworkforce-v#{version}-linux-arm64.tar.gz"
      sha256 "PLACEHOLDER_SHA256_LINUX_ARM64"
    else
      url "https://github.com/siddharthanagula3/agiworkforce-desktop-app/releases/download/v#{version}/agiworkforce-v#{version}-linux-x64.tar.gz"
      sha256 "PLACEHOLDER_SHA256_LINUX_X64"
    end
  end

  def install
    bin.install "agiworkforce"
  end

  test do
    assert_match "agiworkforce", shell_output("#{bin}/agiworkforce --version")
  end
end
