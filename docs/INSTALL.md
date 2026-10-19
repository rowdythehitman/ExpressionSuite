# Installing Expression Suite

You need no Node, no clone of the repo and no admin rights: just one zip from GitHub, `ZXPSignCmd.exe` and the
ZXP/UXP Installer. CI builds the panel folder, and you sign it with your own certificate.

## 1. Download the built panel

1. On GitHub, open **Actions › CI** and click the latest green run for the branch you want.
2. Scroll to **Artifacts** at the bottom and click **expression-suite-panel**. This downloads
   `expression-suite-panel.zip` (you need to be signed in to GitHub).
3. Right-click the zip, choose **Extract All…**, and extract to `C:\Users\epiper\Downloads\expression-suite-panel`.

Check the result: opening `C:\Users\epiper\Downloads\expression-suite-panel` should show `CSXS`, `ide`, `jsx`, `assets`
and `icons` directly inside. If Windows put them one folder deeper (`expression-suite-panel\expression-suite-panel\…`),
move them up a level, because ZXPSignCmd needs `CSXS` at the top of the folder.

## 2. Sign it in Command Prompt

Open **Command Prompt** and paste these one at a time. Use your own password in place of `MyPassword123`, and leave
`&`, `^` and spaces out of it because cmd treats them specially.

```
cd C:\Users\epiper\Downloads
```

**Certificate (first time only).** You can reuse the `expressionlab-cert.p12` you already have, since a certificate
can sign any extension. To keep them separate, make a new one:
```
ZXPSignCmd.exe -selfSignedCert GB NA ExpressionSuite ExpressionSuite MyPassword123 expressionsuite-cert.p12
```

**Sign the panel into a .zxp:**
```
ZXPSignCmd.exe -sign expression-suite-panel ExpressionSuite-0.1.0.zxp expressionsuite-cert.p12 MyPassword123 -tsa http://timestamp.digicert.com
```

**Check it worked (optional):**
```
ZXPSignCmd.exe -verify ExpressionSuite-0.1.0.zxp
```

## 3. Install

1. Drag `ExpressionSuite-0.1.0.zxp` into the ZXP/UXP Installer.
2. Restart After Effects (2025 or later).
3. Open **Window › Extensions › Expression IDE**.

## If something goes wrong

- **`'ZXPSignCmd.exe' is not recognized`:** the file may have another name, such as `ZXPSignCmd-64bit.exe`. Run
  `dir *.exe` to see the real name.
- **The sign step fails at the timestamp:** run it again without `-tsa http://timestamp.digicert.com` on the end.
- **The sign step complains about the manifest:** `CSXS` is nested one folder too deep (see step 1).
- **"Output file already exists":** delete the old `.zxp` first.
- **The panel doesn't appear in Window › Extensions:** check the installer listed it as installed for After Effects.
  The panel needs AE 2025 (25.0) or later.

## Updating

Download the new artifact, extract it the same way, and run only the **Sign** command, with the same `.p12` and
password and a new file name (`ExpressionSuite-0.2.0.zxp`). Keep the `.p12` and password safe: the same certificate
lets updates install over the old version.
