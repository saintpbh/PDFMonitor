cask "pdfmonitor" do
  version "0.1.0"
  sha256 "8530c4139d148d98a8141caca3b49f1e67f36ec30583bbcb0ed242fd57c2fc38"

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
