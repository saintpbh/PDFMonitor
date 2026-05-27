cask "pdfmonitor" do
  version "0.3.3"
  sha256 "065a491fc36c3a78b8fe70fdad7f9648abec15a5981a225597a6bd11331bf270"

  url "https://github.com/saintpbh/PDFMonitor/releases/download/v#{version}/PROK%20PDF%20STUDIO-macOS.zip"
  name "PROK PDF STUDIO"
  desc "High-performance presentation prompter and dual-screen PDF overlay presenter"
  homepage "https://github.com/saintpbh/PDFMonitor"

  app "PROK PDF STUDIO.app"

  zap trash: [
    "~/Library/Application Support/PROK PDF STUDIO",
    "~/Library/Preferences/com.prok.pdf.studio.plist",
  ]
end
