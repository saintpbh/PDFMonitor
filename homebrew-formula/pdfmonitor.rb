cask "pdfmonitor" do
  version "0.3.4"
  sha256 "5b9dcfd81739a5d42bed39144bbf86960268608e239363f2482de70e6f192261"

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
