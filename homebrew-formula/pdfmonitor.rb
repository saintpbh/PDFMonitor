cask "pdfmonitor" do
  version "0.3.5"
  sha256 "847e50099cea9d8287a20f33e57eed5072eb6c6355bc20afd4c8c7c3c7991b68"

  url "https://github.com/saintpbh/PDFMonitor/releases/download/v#{version}/PROK%20PDF%20STUDIO-macOS.zip"
  name "PROK PDF STUDIO"
  desc "High-performance presentation prompter and dual-screen PDF overlay presenter"
  homepage "https://github.com/saintpbh/PDFMonitor"

  app "PROK PDF STUDIO.app"

  postflight do
    system_command "xattr",
                   args: ["-cr", "#{appdir}/PROK PDF STUDIO.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/PROK PDF STUDIO",
    "~/Library/Preferences/com.prok.pdf.studio.plist",
  ]
end
