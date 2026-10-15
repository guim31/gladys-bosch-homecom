# Bosch HomeCom Easy

## Überblick

Diese Integration bringt die Bosch-Geräte deines **HomeCom-Easy**-Kontos über die Bosch-Cloud (dieselbe, die die
App nutzt) in Gladys:

- **Wärmepumpen und Heizkessel** an einem **Connect-Key K 30 RF / K 40 RF** (Compress 5800i, 6800i,
  Condens-Kessel …) oder an einem **ICOM**-Modul (Compress 7000i / 7001i AW): Außentemperatur, Vorlauf- und
  Rücklauftemperatur, Anlagendruck, Status des Wärmeerzeugers, Störungen, und je Heizkreis die Raumtemperatur, die
  Raum-Solltemperatur und die Betriebsart; das Warmwasser mit Temperatur, Sollwert, Modus und Einmalladung;
- **Climate-Klimageräte** (3000i, 5000i, 6000i): Ein/Aus, Modus, Solltemperatur, Lüftergeschwindigkeit,
  Raumtemperatur.

Die Integration liest die Cloud alle paar Minuten und sendet deine Befehle sofort, innerhalb der Grenzen, die das Gerät angibt.

> **Ohne die Hardware entwickelt**: Diese Integration wurde auf Grundlage der öffentlichen Arbeit der Community
> geschrieben (siehe „Grenzen“ und die Danksagungen im README) und mit aufgezeichneten Antworten getestet, nicht an
> einem echten Gerät. Rückmeldungen sind willkommen, im Gladys-Forum oder in den GitHub-Issues.

Diese Integration ist weder mit Bosch verbunden noch von Bosch freigegeben. Es handelt sich nicht um die Integration **Bosch
Smart Home** (Smart Home Controller), die andere Produkte abdeckt.

## Voraussetzungen

- Gladys **5.1.0** oder neuer.
- Ein **HomeCom-Easy**-Konto (SingleKey ID), in dem dein Gerät bereits eingerichtet ist und in der App funktioniert.
  Buderus-Geräte der App **MyDevice** funktionieren genauso: Wähle „Buderus MyDevice“ als Marke der App.
- Ein Computer mit einem Browser mit Entwicklertools (Chrome, Edge, Firefox) für die einmalige Anmeldung.
- Gladys braucht Internetzugang (`singlekey-id.com` und `pointt-api.bosch-thermotechnology.com`).

## Konfiguration

Bosch bietet keine öffentliche Anmeldung für Fremdsoftware: Die Integration nutzt die Anmeldung der App, die auf
einer Adresse endet, die nur die App öffnen kann. Du kopierst einmalig einen Code von Hand.

1. Wähle unter **Integrationen → Bosch HomeCom Easy → Konfiguration** die **Marke der App** und speichere.
2. Klicke neben „Bosch-Konto (SingleKey ID)“ auf **Verbinden**: Die Bosch-Anmeldeseite öffnet sich in einem neuen
   Tab.
3. Drücke in diesem Tab **F12**, um die Entwicklertools zu öffnen, und wähle den Tab **Netzwerk**. Melde dich dann
   mit der E-Mail-Adresse und dem Passwort deiner SingleKey ID an.
4. Die letzte Seite öffnet sich nicht (der Browser kann `com.bosch.tt.dashtt.pointt://…` nicht öffnen): Das ist
   normal. Suche im Tab Netzwerk die Anfrage, deren Adresse `code=` enthält, und kopiere den Wert nach `code=` (er
   endet auf `-1`). Die ganze Adresse zu kopieren geht auch.
5. Füge ihn unter **Autorisierungscode** ein und **speichere innerhalb einer Minute**: Der Code läuft schnell ab und
   gilt nur einmal.

Der Status wechselt zu „verbunden“ und die Geräte erscheinen im Tab **Erkennung**: Füge die gewünschten hinzu.

Dein Passwort erreicht Gladys nie. Die Integration speichert ein **Aktualisierungstoken** in ihrem privaten Volume
(`/data`) und erneuert es selbst: Du meldest dich nur erneut an, wenn Bosch es widerruft (Passwortänderung,
Abmeldung aller Sitzungen …). Der Status zeigt das dann an.

Weitere Einstellungen:

- **Aktualisierungsintervall**: wie oft die Cloud abgefragt wird, standardmäßig 5 Minuten, mindestens 2 Minuten.
- **Sprache der Gerätenamen**: die Namen, die beim Hinzufügen eines Geräts festgelegt werden (standardmäßig
  Französisch).
- **Verbindung testen**: listet die Geräte des Kontos auf, unterstützt oder nicht.

## Geräte

Jede Anlage ergibt mehrere Gladys-Geräte, damit du jeden Heizkreis seinem Raum zuordnen kannst. Es werden nur die
Werte angelegt, die dein Gerät meldet.

### Wärmeerzeuger

Die Wärmepumpe oder der Heizkessel: Außentemperatur, Vorlauf- und Rücklauftemperatur, Anlagendruck (bar), Status
des Wärmeerzeugers (Heizen, Warmwasser, Frostschutz, Bereit), Gesamtverbrauch (kWh, nur ICOM) und aktive
Störungscodes (sonst „Keine Störung“).

### Heizkreis

Ein Gerät je Kreis (hc1, hc2 …): Raumtemperatur (wenn ein Raumfühler oder Raumthermostat vorhanden ist),
Luftfeuchtigkeit (falls verfügbar), **Raum-Solltemperatur** und **Betriebsart** (Zeitprogramm, Manuell, Aus — die
Modi, die der Kreis anbietet). Die Solltemperatur ist auf den Bereich begrenzt, den das Gerät angibt (meist
5–30 °C), und wird auf halbe Grad gerundet. Im Kühlbetrieb wird die Kühl-Solltemperatur geändert.

### Warmwasser

Ein Gerät je Warmwasserkreis: Wassertemperatur, **Sollwert**, **Modus** (Aus, Eco, Komfort, eigenes Programm …, je
nach Gerät) und **Extra-Warmwasser**, eine Einmalladung, die du startest oder stoppst. Der Sollwert ändert die
Temperatur der aktiven Stufe (Komfort, Eco …); er lässt sich nicht ändern, wenn das Warmwasser aus ist.

### Klimaanlage

Ein/Aus, Modus (Auto, Kühlen, Heizen, Entfeuchten, Lüften), Solltemperatur (meist 16–30 °C),
Lüftergeschwindigkeit und Raumtemperatur.

## Widget

**Heizung und Warmwasser** zeigt auf dem Dashboard die Raumtemperatur und den Sollwert des ersten Kreises, die
Warmwasser- und Außentemperatur, den Heiz- und Warmwasser-Modus, was der Wärmeerzeuger gerade tut und die
Störungen, mit einem Button **Extra-Warmwasser**. Wähle in seinen Einstellungen ein beliebiges Gerät einer Anlage,
um diese anzuzeigen (praktisch bei mehreren Gateways); leer wird die erste angezeigt.

## Szenen-Auslöser

**Bosch-Störung gemeldet** startet eine Szene, wenn ein Gerät einen **neuen** Störungscode meldet. Wähle den
Wärmeerzeuger oder die Klimaanlage, oder lass das Feld für jedes Gerät leer. Die Variable **Störungscode** enthält
den Code (zum Beispiel `A01-5`), für eine Benachrichtigung. Störungen, die bei der Anmeldung schon bestehen, starten
die Szene nicht, und eine Störung startet sie einmal, nicht bei jeder Abfrage.

Temperaturen, Modi und Sollwerte sind Gerätefunktionen: Nutze sie in den üblichen Auslösern und Bedingungen
„Gerätewert“ des Szenen-Editors.

## Szenen-Beispiele

- **Störungsalarm**: Auslöser „Bosch-Störung gemeldet“ → die Nachricht „Störung Wärmepumpe
  {{triggerEvent.data.code}}“ an die Familie senden.
- **Warmwasser bei Solarüberschuss**: Wenn die Solarproduktion 2 kW übersteigt, „Extra-Warmwasser“ des
  Warmwasser-Geräts einschalten.
- **Abwesenheit**: Wenn alle gehen, die Raum-Solltemperatur auf 17 °C setzen; wenn die erste Person zurückkommt, auf
  20 °C.
- **Sommerabend**: Um 19 Uhr, wenn das Wohnzimmer über 27 °C liegt, die Klimaanlage im Kühlmodus auf 25 °C
  einschalten.

## Fehlerbehebung

- **„Dieser Code stammt nicht vom Button Verbinden“**: Der Code wurde anderswo erzeugt (zum Beispiel mit einem
  anderen Werkzeug). Klicke in dieser Integration auf **Verbinden**, melde dich erneut an und füge den neuen Code
  ein.
- **„Bosch hat den Code abgelehnt“**: Der Code wurde schon benutzt, ist abgelaufen (er gilt etwa eine Minute) oder
  wurde unvollständig kopiert. Klicke erneut auf **Verbinden**; füge den Wert direkt nach `code=` ein, bis zum `&`,
  falls vorhanden.
- **Keine Anfrage mit `code=`**: Öffne die Entwicklertools **vor** der Anmeldung, im Tab der Anmeldeseite. Aktiviere
  in Chrome „Log beibehalten“ im Tab Netzwerk.
- **„Die Bosch-Anmeldung ist abgelaufen“**: Bosch hat das Aktualisierungstoken widerrufen. Melde dich wie unter
  Konfiguration beschrieben erneut an.
- **„Die Bosch-Cloud antwortet nicht“**: Ausfall des Internets oder von Bosch; die Integration versucht es bei jeder
  Aktualisierung erneut und meldet, wenn es wieder geht. Die Geräte bleiben aufgelistet.
- **Ein Gerät fehlt**: Starte **Verbindung testen**. Ein als „nicht unterstützt“ aufgeführtes Gerät
  (Warmwasserbereiter `wddw2`, Thermostat `rrc2`, Wallbox, Matter-Klimagerät …) wird noch nicht abgedeckt.
- **Ein Befehl wird abgelehnt**: Der Wert liegt außerhalb des Bereichs, den das Gerät angibt, oder der Modus wird von
  diesem Gerät nicht angeboten. Die Protokolle der Integration sagen warum (`LOG_LEVEL=debug` zeigt jede Abfrage).

## Grenzen

- **Nur Cloud**: kein lokaler Zugriff. Fällt die Bosch-Cloud oder die Internetverbindung aus, wird nichts gelesen
  und nichts gesendet.
- **Kontingente**: Bosch veröffentlicht kein Kontingent für diese API. Die Integration bleibt sparsam: zwei bis drei
  Anfragen pro Gateway bei jeder Aktualisierung (standardmäßig 5 Minuten, mindestens 2 Minuten), eine Anfrage pro
  Befehl, und sie hört auf, sobald Bosch „zu viele Anfragen“ meldet oder die Anmeldung ablehnt.
- **Inoffizielle API**: Es ist die der App HomeCom Easy, von der Community dokumentiert. Bosch kann sie ohne
  Vorankündigung ändern.
- **Verzögerung**: Ein Befehl wird sofort angezeigt, aber die Cloud braucht manchmal eine Minute, um den neuen Wert
  zu melden; die nächste Abfrage bestätigt oder korrigiert ihn.
- **K30/K40 im Zeitprogramm**: Die geschriebene Raum-Solltemperatur ist die des manuellen Betriebs (wie in der
  Home-Assistant-Integration). Um die Raumtemperatur sofort zu ändern, schalte den Kreis auf Manuell.
- Nicht abgedeckt: Urlaubs- und Abwesenheitsprogramme, Zeitpläne, Lüftung, Solarkreise, Pools, Energieverlauf
  (Tages- und Monatszähler), Warmwasserbereiter `wddw2`, Thermostate `rrc2`, Wallboxen und über Matter in Betrieb
  genommene Klimageräte.
- Einstellungen, die gefährlich sein könnten (Heizkurven, maximale Vorlauftemperatur, thermische Desinfektion),
  werden nicht angeboten.

## Daten und Datenschutz

Die Integration speichert in ihrem privaten Volume (`/data`): das Aktualisierungstoken deines Bosch-Kontos, das
PKCE-Geheimnis der letzten laufenden Anmeldung, die Liste deiner Geräte und die bereits gemeldeten Störungscodes.
Dein Passwort, deine Tokens und der Autorisierungscode werden nie gespeichert oder protokolliert. Die Integration spricht nur
mit `singlekey-id.com` und `pointt-api.bosch-thermotechnology.com`.
