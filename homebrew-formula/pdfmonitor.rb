cask "pdfmonitor" do
  version "0.3.1"
  sha256 "8c84ea2c5866daf31968a1b7e777a0e8889160847f59c5b7c61fab91524dcf89"

  url "https://github.com/saintpbh/PDFMonitor/releases/download/v#{version}/PDFMonitor-macOS.zip"
  name "PDFMonitor"
  desc "High-performance presentation prompter and dual-screen PDF overlay presenter"
  homepage "https://github.com/saintpbh/PDFMonitor"

  app "PDFMonitor.app"

  zap trash: [
    "~/Library/Application Support/PDFMonitor",
    "~/Library/Preferences/com.antigravity.pdf.studio.plist",
  ]
end
