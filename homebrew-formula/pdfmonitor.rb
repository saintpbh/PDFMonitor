cask "pdfmonitor" do
  version "0.1.0"
  sha256 "02b3d180b764858a58428aaff0fe87f84714524a8c4add5771f2f7d8ef0100d2"

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
