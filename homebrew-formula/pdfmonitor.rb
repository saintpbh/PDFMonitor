cask "pdfmonitor" do
  version "0.3.2"
  sha256 "a09e2c9bf6a3dc847ca9ded2a767a738d94f84a784b92c43219648ebaf1ef1c2"

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
