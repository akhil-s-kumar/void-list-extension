# Void List - Tasks, Snippets & Focus Mode

<p align="center">
  <img src="https://raw.githubusercontent.com/akhil-s-kumar/void-list-extension/main/assets/icon.png" width="128" alt="Void List Logo">
</p>

<p align="center">
  <b>Functional Todo and Snippet Manager right inside VS Code. Sync seamlessly with the Void List mobile app.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/visual-studio-marketplace/v/IamAkhilSKumar.void-list-extension?style=flat-square&color=007acc&label=VS%20Code" alt="VS Code Marketplace Version">
  <img src="https://img.shields.io/visual-studio-marketplace/d/IamAkhilSKumar.void-list-extension?style=flat-square&color=007acc" alt="Downloads">
</p>

## ✨ Features

- 📝 **Task Management**: Keep track of your daily tasks without ever leaving your editor.
- ✂️ **Snippet Library**: Save, organize, and insert reusable code snippets instantly.
- 📱 **Mobile Sync**: QR-code pairing to sync seamlessly with the Void List mobile app (similar to WhatsApp Web).
- ⚡ **Local-First & Offline**: Everything works completely offline. Your data stays on your machine and syncs automatically when online.
- 🎯 **Focus Mode**: Minimize distractions and stay in the zone.

## 🚀 Getting Started

1. Open the **Extensions** view in VS Code (`Ctrl+Shift+X` or `Cmd+Shift+X`).
2. Search for `Void List`.
3. Click **Install**.
4. Click the **Void List icon** in the Activity Bar to open the sidebar.

## 💡 Usage

* **Open Sidebar**: Click the Void List icon in the Activity Bar or run the command `Void List: Open Sidebar`.
* **Add a Task**: Click the `+` button in the Tasks view or run `Void List: Add Task`.
* **Manage Snippets**: Access your snippet library directly from the sidebar. Insert them into your active editor with a single click.
* **Sync Now**: Force sync data with your paired devices (Command: `Void List: Sync Now`).

## ⚙️ Extension Settings

This extension contributes the following settings:

* `voidList.enableSync`: Enable or disable mobile synchronization.
* `voidList.syncServerUrl`: Custom server URL for syncing (if using self-hosted relay).

## 🔒 Privacy & Security

We believe in a **local-first** approach. Your tasks and snippets are saved locally on your device by default. Syncing is end-to-end encrypted and happens peer-to-peer or via a secure relay server. We do not store your data.

## 🛠️ Development & Contributing

1. Clone the repository: `git clone https://github.com/IamAkhilSKumar/void-list-extension.git`
2. Open the folder in VS Code.
3. Run `npm install`
4. Press `F5` to start debugging.

## 📝 Release Notes

### 0.0.1
- Initial release of Void List Extension.
- Sidebar UI setup.
- Basic task and snippet placeholders.
- Sync architecture foundation.

---

**Enjoying Void List?** Please leave a review on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=IamAkhilSKumar.void-list-extension)!
