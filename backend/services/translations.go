package services

// Translations contains all text that appears on invoices
type InvoiceTranslations struct {
	Invoice           string
	Status            string
	BillTo            string
	InvoiceDetails    string
	Period            string
	Generated         string
	Description       string
	Amount            string
	Total             string
	PaymentInfo       string
	BankDetails       string
	AccountHolder     string
	IBAN              string
	Reference         string
	PleasePayBy       string
	ThankYou          string
	ArchivedNotice    string
	
	// Item type translations
	NormalPower       string
	SolarPower        string
	CarCharging       string
	SharedMeter       string
	CustomItem        string
	
	// NEW: Additional translations for item descriptions
	ApartmentMeter    string
	OldReading        string
	NewReading        string
	Consumption       string
	NormalPowerGrid   string
	SolarMode         string
	PriorityMode      string
	AdditionalServices string
	TotalConsumption  string
	YourShare         string
	SplitEqually      string
	SplitByUnits      string
	CustomSplit       string
	Among             string
	Users             string
	Of                string
	TotalUnits        string
	
	// QR Code section translations
	ReceiptSection    string  // "Empfangsschein" / "Receipt" / "Section de réception" / "Sezione ricevuta"
	PaymentPart       string  // "Zahlteil" / "Payment part" / "Section paiement" / "Sezione pagamento"
	AccountPayableTo  string  // "Konto / Zahlbar an" / "Account / Payable to" / "Compte / Payable à" / "Conto / Pagabile a"
	PayableBy         string  // "Zahlbar durch" / "Payable by" / "Payable par" / "Pagabile da"
	Currency          string  // "Währung" / "Currency" / "Monnaie" / "Valuta"
	AmountLabel       string  // "Betrag" / "Amount" / "Montant" / "Importo"
	AcceptancePoint   string  // "Annahmestelle" / "Acceptance point" / "Point d'acceptation" / "Punto di accettazione"
	AdditionalInfo    string  // "Zusätzliche Informationen" / "Additional information" / "Informations supplémentaires" / "Informazioni aggiuntive"
	InvoiceLabel      string  // "Invoice" / "Rechnung" / "Facture" / "Fattura"
}

// GetTranslations returns translations for the specified language
func GetTranslations(language string) InvoiceTranslations {
	switch language {
	case "de": // German
		return InvoiceTranslations{
			Invoice:            "Rechnung",
			Status:             "Status",
			BillTo:             "Rechnungsempfänger",
			InvoiceDetails:     "Rechnungsdetails",
			Period:             "Zeitraum",
			Generated:          "Erstellt",
			Description:        "Beschreibung",
			Amount:             "Betrag",
			Total:              "Gesamt",
			PaymentInfo:        "Zahlungsinformationen",
			BankDetails:        "Bankverbindung",
			AccountHolder:      "Kontoinhaber",
			IBAN:               "IBAN",
			Reference:          "Referenz",
			PleasePayBy:        "Bitte zahlen Sie bis",
			ThankYou:           "Vielen Dank für Ihre Zahlung!",
			ArchivedNotice:     "ARCHIVIERT - Diese Rechnung wurde archiviert und ist nicht mehr gültig",
			NormalPower:        "Normaler Strom",
			SolarPower:         "Solarstrom",
			CarCharging:        "Autoladen",
			SharedMeter:        "Gemeinsamer Zähler",
			CustomItem:         "Benutzerdefinierter Posten",
			ApartmentMeter:     "Wohnungszähler",
			OldReading:         "Alt",
			NewReading:         "Neu",
			Consumption:        "Verbrauch",
			NormalPowerGrid:    "Normaler Strom (Netz)",
			SolarMode:          "Solarmodus",
			PriorityMode:       "Prioritätsmodus",
			AdditionalServices: "Zusätzliche Dienstleistungen",
			TotalConsumption:   "Gesamtverbrauch",
			YourShare:          "Ihr Anteil",
			SplitEqually:       "Gleichmäßig aufgeteilt",
			SplitByUnits:       "Aufgeteilt nach Einheiten",
			CustomSplit:        "Benutzerdefinierte Aufteilung",
			Among:              "unter",
			Users:              "Benutzer",
			Of:                 "von",
			TotalUnits:         "Gesamteinheiten",
			ReceiptSection:     "Empfangsschein",
			PaymentPart:        "Zahlteil",
			AccountPayableTo:   "Konto / Zahlbar an",
			PayableBy:          "Zahlbar durch",
			Currency:           "Währung",
			AmountLabel:        "Betrag",
			AcceptancePoint:    "Annahmestelle",
			AdditionalInfo:     "Zusätzliche Informationen",
			InvoiceLabel:       "Rechnung",
		}
	case "fr": // French
		return InvoiceTranslations{
			Invoice:            "Facture",
			Status:             "Statut",
			BillTo:             "Facturé à",
			InvoiceDetails:     "Détails de la facture",
			Period:             "Période",
			Generated:          "Générée le",
			Description:        "Description",
			Amount:             "Montant",
			Total:              "Total",
			PaymentInfo:        "Informations de paiement",
			BankDetails:        "Coordonnées bancaires",
			AccountHolder:      "Titulaire du compte",
			IBAN:               "IBAN",
			Reference:          "Référence",
			PleasePayBy:        "Veuillez payer avant le",
			ThankYou:           "Merci pour votre paiement!",
			ArchivedNotice:     "ARCHIVÉ - Cette facture a été archivée et n'est plus valide",
			NormalPower:        "Électricité normale",
			SolarPower:         "Énergie solaire",
			CarCharging:        "Recharge de voiture",
			SharedMeter:        "Compteur partagé",
			CustomItem:         "Article personnalisé",
			ApartmentMeter:     "Compteur d'appartement",
			OldReading:         "Ancien",
			NewReading:         "Nouveau",
			Consumption:        "Consommation",
			NormalPowerGrid:    "Électricité normale (réseau)",
			SolarMode:          "Mode solaire",
			PriorityMode:       "Mode prioritaire",
			AdditionalServices: "Services supplémentaires",
			TotalConsumption:   "Consommation totale",
			YourShare:          "Votre part",
			SplitEqually:       "Divisé également",
			SplitByUnits:       "Divisé par unités",
			CustomSplit:        "Division personnalisée",
			Among:              "parmi",
			Users:              "utilisateurs",
			Of:                 "de",
			TotalUnits:         "unités totales",
			ReceiptSection:     "Récépissé",
			PaymentPart:        "Section paiement",
			AccountPayableTo:   "Compte / Payable à",
			PayableBy:          "Payable par",
			Currency:           "Monnaie",
			AmountLabel:        "Montant",
			AcceptancePoint:    "Point de dépot",
			AdditionalInfo:     "Informations supplémentaires",
			InvoiceLabel:       "Facture",
		}
	case "it": // Italian
		return InvoiceTranslations{
			Invoice:            "Fattura",
			Status:             "Stato",
			BillTo:             "Fatturato a",
			InvoiceDetails:     "Dettagli fattura",
			Period:             "Periodo",
			Generated:          "Generata il",
			Description:        "Descrizione",
			Amount:             "Importo",
			Total:              "Totale",
			PaymentInfo:        "Informazioni di pagamento",
			BankDetails:        "Dati bancari",
			AccountHolder:      "Titolare del conto",
			IBAN:               "IBAN",
			Reference:          "Riferimento",
			PleasePayBy:        "Si prega di pagare entro",
			ThankYou:           "Grazie per il pagamento!",
			ArchivedNotice:     "ARCHIVIATO - Questa fattura è stata archiviata e non è più valida",
			NormalPower:        "Energia normale",
			SolarPower:         "Energia solare",
			CarCharging:        "Ricarica auto",
			SharedMeter:        "Contatore condiviso",
			CustomItem:         "Voce personalizzata",
			ApartmentMeter:     "Contatore appartamento",
			OldReading:         "Vecchio",
			NewReading:         "Nuovo",
			Consumption:        "Consumo",
			NormalPowerGrid:    "Energia normale (rete)",
			SolarMode:          "Modalità solare",
			PriorityMode:       "Modalità prioritaria",
			AdditionalServices: "Servizi aggiuntivi",
			TotalConsumption:   "Consumo totale",
			YourShare:          "La tua quota",
			SplitEqually:       "Diviso equamente",
			SplitByUnits:       "Diviso per unità",
			CustomSplit:        "Divisione personalizzata",
			Among:              "tra",
			Users:              "utenti",
			Of:                 "di",
			TotalUnits:         "unità totali",
			ReceiptSection:     "Ricevuta",
			PaymentPart:        "Sezione pagamento",
			AccountPayableTo:   "Conto / Pagabile a",
			PayableBy:          "Pagabile da",
			Currency:           "Valuta",
			AmountLabel:        "Importo",
			AcceptancePoint:    "Punto di accettazione",
			AdditionalInfo:     "Informazioni supplementari",
			InvoiceLabel:       "Fattura",
		}
	default: // English
		return InvoiceTranslations{
			Invoice:            "Invoice",
			Status:             "Status",
			BillTo:             "Bill To",
			InvoiceDetails:     "Invoice Details",
			Period:             "Period",
			Generated:          "Generated",
			Description:        "Description",
			Amount:             "Amount",
			Total:              "Total",
			PaymentInfo:        "Payment Information",
			BankDetails:        "Bank Details",
			AccountHolder:      "Account Holder",
			IBAN:               "IBAN",
			Reference:          "Reference",
			PleasePayBy:        "Please pay by",
			ThankYou:           "Thank you for your payment!",
			ArchivedNotice:     "ARCHIVED - This invoice has been archived and is no longer valid",
			NormalPower:        "Normal Power",
			SolarPower:         "Solar Power",
			CarCharging:        "Car Charging",
			SharedMeter:        "Shared Meter",
			CustomItem:         "Custom Item",
			ApartmentMeter:     "Apartment Meter",
			OldReading:         "Old",
			NewReading:         "New",
			Consumption:        "Consumption",
			NormalPowerGrid:    "Normal Power (Grid)",
			SolarMode:          "Solar Mode",
			PriorityMode:       "Priority Mode",
			AdditionalServices: "Additional Services",
			TotalConsumption:   "Total consumption",
			YourShare:          "Your share",
			SplitEqually:       "Split equally",
			SplitByUnits:       "Split by units",
			CustomSplit:        "Custom split",
			Among:              "among",
			Users:              "users",
			Of:                 "of",
			TotalUnits:         "total units",
			ReceiptSection:     "Receipt",
			PaymentPart:        "Payment part",
			AccountPayableTo:   "Account / Payable to",
			PayableBy:          "Payable by",
			Currency:           "Currency",
			AmountLabel:        "Amount",
			AcceptancePoint:    "Acceptance point",
			AdditionalInfo:     "Additional information",
			InvoiceLabel:       "Invoice",
		}
	}
}

// TranslateItemType translates item types to the specified language
func TranslateItemType(itemType string, translations InvoiceTranslations) string {
	switch itemType {
	case "normal_power":
		return translations.NormalPower
	case "solar_power":
		return translations.SolarPower
	case "car_charging":
		return translations.CarCharging
	case "shared_meter":
		return translations.SharedMeter
	case "custom":
		return translations.CustomItem
	default:
		return itemType
	}
}