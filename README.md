# Musik Garde - Lokaler MP3 Player PWA

Ein einfacher, offline-fähiger Musik-Player für dein Smartphone. Keine Installation, keine App-Stores - einfach über den Browser installieren und nutzen.

## Features

✅ **Lokale MP3-Dateien** - Spiele Musik direkt von deinem Gerät ab  
✅ **Offline funktionsfähig** - Funktioniert auch ohne Internetverbindung  
✅ **Installation auf Home Screen** - Funktioniert wie eine native App  
✅ **Vollständige Steuerung** - Play, Pause, Stop, Vor, Zurück  
✅ **Lautstärkeregelung** - Mit Stummschalten-Funktion  
✅ **Playlist-Verwaltung** - Übersichtliche Dateiliste  
✅ **Responsive Design** - Optimiert für Smartphone-Bildschirme  

## Installation & Nutzung

### Schritt 1: Server starten

Öffne das Terminal/PowerShell im `MusicPlayer`-Verzeichnis und starten den Server:

**Mit Python (vorinstalliert unter Windows):**
```bash
python -m http.server 8000
```

**Mit Node.js (falls installiert):**
```bash
npx http-server -p 8000
```

Der Server läuft dann auf `http://localhost:8000`

### Schritt 2: Deine IP-Adresse finden

**Windows PowerShell:**
```bash
ipconfig
```

Suche nach `IPv4-Adresse` (z.B. `192.168.1.100`)

### Schritt 3: Auf deinem Smartphone öffnen

1. Smartphone mit gleich WiFi-Netzwerk verbinden
2. Browser öffnen (Chrome, Safari, Firefox)
3. Adresse eingeben: `http://DEINE-IP:8000`
4. Die App lädt

### Schritt 4: Installieren

**Android (Chrome/Edge):**
- Tap auf das Menü (⋮)
- "App installieren" oder "Add to Home Screen"

**iPhone (Safari):**
- Tap auf Share
- "Add to Home Screen"

Fertig! Die App ist jetzt auf deinem Home Screen.

## Verwendung

1. **Musik importieren** - Tap auf "📁 Musik importieren" und wähle MP3-Dateien
2. **Abspielen** - Wähle einen Song aus der Playlist oder tap Play
3. **Steuerung** - Nutze die Buttons für Play, Pause, Stop, Vor/Zurück
4. **Lautstärke** - Regele mit dem Schieberegler oder stummschalten

## Anforderungen

- **Smartphone**: iOS 14+ oder Android 5+
- **Browser**: Chrome, Safari, Firefox oder Edge
- **Netzwerk**: Lokales WiFi zum Verbinden mit deinem Computer
- **Dateien**: MP3-Dateien auf deinem Smartphone

## Offline-Nutzung

Nach dem Laden der App einmalig funktioniert die App komplett offline. Musik-Dateien müssen jedes Mal neu ausgewählt werden, da diese nicht dauerhaft gespeichert werden.

## Browser-Kompatibilität

✅ Chrome/Edge 51+  
✅ Safari 14+ (iOS)  
✅ Firefox 55+  
✅ Samsung Internet 5+  

## Tipps

- **Schneller Zugriff**: Speichere die Website als Bookmark
- **Bessere Performance**: Verwende 2,4 GHz WiFi (nicht 5 GHz)
- **Mehrere Geräte**: Jeder kann sich mit der gleichen URL verbinden
- **Sicherheit**: Der Player speichert keine Dateien auf dem Server

## Troubleshooting

### "Seite kann nicht erreicht werden"
- Überprüfe, ob der Server noch läuft
- Überprüfe deine IP-Adresse
- Beide Geräte müssen im selben WiFi-Netzwerk sein

### Musik startet nicht
- Stelle sicher, dass es MP3-Dateien sind
- Überprüfe die Dateiberechtigung auf deinem Gerät
- Versuche, die Seite neu zu laden

### App wird nicht installiert
- Nutzungsanforderungen prüfen (iOS 14+, Android 5+)
- Browser aktualisieren
- Cache leeren und neu versuchen

---

Viel Spaß mit Musik Garde! 🎵
