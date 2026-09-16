# Reference copy of the Homebrew formula. NOT the published one, and not read by
# anything: update-homebrew-tap.sh writes the tap's formula from its own heredoc,
# so this file is a shape to read, never a file that ships.
#
# The placeholders below are therefore placeholders forever. They have already
# been mistaken for a broken install path once, on a release-gate review; the
# published formula at github.com/siddharthanagula3/homebrew-tap carries real
# checksums and is what `brew install` resolves.
#
# Install via tap: brew install siddharthanagula3/tap/agiworkforce

class Agiworkforce < Formula
  desc "Multi-model AI agent for your terminal, BYOK, 25 providers, MCP, computer-use"
  homepage "https://agiworkforce.com"
  license "Proprietary"
  version "1.0.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/siddharthanagula3/agiworkforce/releases/download/v-cli-#{version}/agiworkforce-darwin-arm64.tar.gz"
      sha256 "PLACEHOLDER_SHA256_DARWIN_ARM64"
    else
      url "https://github.com/siddharthanagula3/agiworkforce/releases/download/v-cli-#{version}/agiworkforce-darwin-x64.tar.gz"
      sha256 "PLACEHOLDER_SHA256_DARWIN_X64"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/siddharthanagula3/agiworkforce/releases/download/v-cli-#{version}/agiworkforce-linux-arm64.tar.gz"
      sha256 "PLACEHOLDER_SHA256_LINUX_ARM64"
    else
      url "https://github.com/siddharthanagula3/agiworkforce/releases/download/v-cli-#{version}/agiworkforce-linux-x64.tar.gz"
      sha256 "PLACEHOLDER_SHA256_LINUX_X64"
    end
  end

  def install
    if File.exist?("agi")
      bin.install "agi"
    else
      bin.install "agiworkforce" => "agi"
    end
    bin.install "agiworkforce" if File.exist?("agiworkforce")
  end

  test do
    assert_match "agi", shell_output("#{bin}/agi --version")
    # --list-models works without any API key (proves binary boots)
    assert_match "ANTHROPIC", shell_output("#{bin}/agi --list-models")
    assert_predicate bin/"agiworkforce", :exist?
  end
end
