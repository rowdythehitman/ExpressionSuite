# Installing Expression Suite without admin rights

You don't need Node, `regedit` or an installer. The ZXP is signed (self-signed), so After Effects loads it without
`PlayerDebugMode`. It goes into your **user** extensions folder, which needs no admin rights.

## 1. Get the ZXP

On GitHub, open **Actions › ZXP**, pick the latest run for the branch you want, and download the
`expression-suite-zxp` artifact. It's a `.zip` that contains `com.expressionsuite.cep.zxp`.
(Tagged versions also attach the `.zxp` to a release under **Releases**.)

## 2. Put it in your user extensions folder

A `.zxp` is a zip file.

1. Close After Effects.
2. Copy `com.expressionsuite.cep.zxp`, rename the copy to `com.expressionsuite.cep.zip`, and extract it.
3. Move the extracted folder (it holds `CSXS`, `META-INF`, `ide`, `jsx`, …) into the folder below and name it
   `com.expressionsuite.cep`:
   - **Windows:** `%APPDATA%\Adobe\CEP\extensions\` (paste that into the Explorer address bar; create
     `CEP\extensions` if it doesn't exist).
   - **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/` (Finder › Go › Go to Folder…).

   You should end up with `…\extensions\com.expressionsuite.cep\CSXS\manifest.xml`.
4. Start After Effects and open **Window › Extensions › Expression IDE**.

## Updating

Close AE, delete the `com.expressionsuite.cep` folder, and extract the new ZXP in its place. Don't extract over the old
folder: leftover files from the old version break the signature check.

## If the panel doesn't appear

- Check that `CSXS\manifest.xml` sits directly inside `com.expressionsuite.cep` (no extra folder level from extracting).
- The ZXP needs After Effects 2025 (25.0) or later.
- If your machine's policy blocks CEP extensions entirely, there's no way around it without IT. Ask them to allow
  this one extension.
