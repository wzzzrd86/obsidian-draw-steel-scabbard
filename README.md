# Draw Steel Scabbard - Obsidian Companion Plugin

A dedicated Obsidian sidebar window that connects directly to your **Scabbard Compendium API** (`scabbard.leweber.org`) to browse, search, and link weapons and items seamlessly while running or prepping your Draw Steel campaign.

---

## Features

- **Dedicated Sidebar / Window View**: Click the **Sword** icon in the ribbon to open the Scabbard panel in your sidebar or floating pane.
- **Weapon-First Browser**: Opens by default to all Draw Steel leveled weapons (with quick filter tabs for Armor, Trinkets, Consumables, and Artifacts).
- **Multi-Item Selection (`Ctrl + Click`)**: Select multiple items with `Ctrl + Click` (or `Cmd + Click` on macOS, or tap the item checkbox). A dedicated batch bar lets you insert links, cards, or vault notes for all selected items at once.
- **Random Loot Roller (`🎲 Random 2-3`)**: Select an echelon (or select items manually) and roll 2 to 3 random rewards with one click, complete with an instant "Insert All Links/Cards" action banner.
- **One-Click Linking (`+ Link`)**: Inserts an internal wikilink (e.g. `[[Glancing Bow]]` or `[[Longclaw]]`) directly at your cursor.
- **Formatted Card Insertion (`+ Card`)**: Inserts a rich Obsidian Callout block with the weapon's keywords, lore, recipe, and 1st/5th/9th level stats directly into your active note.
- **Auto-Generate Notes (`+ Note`)**: Automatically generates a standalone markdown note in `Compendium/Items/` complete with structured YAML frontmatter for Dataview queries.
- **Quick Search Modal (`Ctrl + P`)**: Press `Ctrl + P` -> `Draw Steel: Quick Search & Link Weapon or Item` to search and link weapons instantly without leaving your text.

---

## Installation in Obsidian

1. Locate your Obsidian vault folder on your computer.
2. In your vault, navigate to the hidden `.obsidian/plugins/` folder (enable hidden files if needed):
   ```text
   <Your-Vault>/.obsidian/plugins/
   ```
3. Copy the entire `draw-steel-scabbard` folder into `.obsidian/plugins/`:
   ```text
   <Your-Vault>/.obsidian/plugins/draw-steel-scabbard/
     ├── manifest.json
     ├── main.js
     ├── styles.css
     └── README.md
   ```
4. In Obsidian:
   - Go to **Settings** -> **Community plugins**.
   - Make sure **Restricted mode** is turned **OFF**.
   - Click the **Refresh** button under Installed plugins.
   - Toggle **Draw Steel Scabbard** to **ON**.

---

## Configuration

In Obsidian, go to **Settings** -> **Draw Steel Scabbard**:

- **Scabbard Server URL**: Defaults to `https://scabbard.leweber.org` (can be changed to local `http://localhost:3840` or your LAN IP).
- **Default View Category**: Choose which category opens by default (defaults to **Weapons**).
- **Vault Notes Folder**: Choose where `+ Note` creates item files (defaults to `Compendium/Items`).
- **Test Connection**: Verify live API communication with your server.

---

## Usage

1. **Open the View**: Click the **Sword icon** in your left ribbon.
2. **Filter & Search**: Type to search across names, traits (e.g. `Light Weapon`, `Magic`), effects, or ingredients.
3. **Link into Active Notes**: Click `+ Link` to insert `[[Item Name]]`, or `+ Card` to insert full rules text.
