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
}

// GetTranslations returns translations for the specified language
func GetTranslations(language string) InvoiceTranslations {
	switch language {
	case "de": // German
		return InvoiceTranslations{
			Invoice:        "Rechnung",
			Status:         "Status",
			BillTo:         "Rechnungsempfänger",
			InvoiceDetails: "Rechnungsdetails",
			Period:         "Zeitraum",
			Generated:      "Erstellt",
			Description:    "Beschreibung",
			Amount:         "Betrag",
			Total:          "Gesamt",
			PaymentInfo:    "Zahlungsinformationen",
			BankDetails:    "Bankverbindung",
			AccountHolder:  "Kontoinhaber",
			IBAN:           "IBAN",
			Reference:      "Referenz",
			PleasePayBy:    "Bitte zahlen Sie bis",
			ThankYou:       "Vielen Dank für Ihre Zahlung!",
			ArchivedNotice: "ARCHIVIERT - Diese Rechnung wurde archiviert und ist nicht mehr gültig",
			NormalPower:    "Normaler Strom",
			SolarPower:     "Solarstrom",
			CarCharging:    "Autoladen",
			SharedMeter:    "Gemeinsamer Zähler",
			CustomItem:     "Benutzerdefinierter Posten",
		}
	case "fr": // French
		return InvoiceTranslations{
			Invoice:        "Facture",
			Status:         "Statut",
			BillTo:         "Facturé à",
			InvoiceDetails: "Détails de la facture",
			Period:         "Période",
			Generated:      "Générée le",
			Description:    "Description",
			Amount:         "Montant",
			Total:          "Total",
			PaymentInfo:    "Informations de paiement",
			BankDetails:    "Coordonnées bancaires",
			AccountHolder:  "Titulaire du compte",
			IBAN:           "IBAN",
			Reference:      "Référence",
			PleasePayBy:    "Veuillez payer avant le",
			ThankYou:       "Merci pour votre paiement!",
			ArchivedNotice: "ARCHIVÉ - Cette facture a été archivée et n'est plus valide",
			NormalPower:    "Électricité normale",
			SolarPower:     "Énergie solaire",
			CarCharging:    "Recharge de voiture",
			SharedMeter:    "Compteur partagé",
			CustomItem:     "Article personnalisé",
		}
	case "it": // Italian
		return InvoiceTranslations{
			Invoice:        "Fattura",
			Status:         "Stato",
			BillTo:         "Fatturato a",
			InvoiceDetails: "Dettagli fattura",
			Period:         "Periodo",
			Generated:      "Generata il",
			Description:    "Descrizione",
			Amount:         "Importo",
			Total:          "Totale",
			PaymentInfo:    "Informazioni di pagamento",
			BankDetails:    "Dati bancari",
			AccountHolder:  "Titolare del conto",
			IBAN:           "IBAN",
			Reference:      "Riferimento",
			PleasePayBy:    "Si prega di pagare entro",
			ThankYou:       "Grazie per il pagamento!",
			ArchivedNotice: "ARCHIVIATO - Questa fattura è stata archiviata e non è più valida",
			NormalPower:    "Energia normale",
			SolarPower:     "Energia solare",
			CarCharging:    "Ricarica auto",
			SharedMeter:    "Contatore condiviso",
			CustomItem:     "Voce personalizzata",
		}
	default: // English
		return InvoiceTranslations{
			Invoice:        "Invoice",
			Status:         "Status",
			BillTo:         "Bill To",
			InvoiceDetails: "Invoice Details",
			Period:         "Period",
			Generated:      "Generated",
			Description:    "Description",
			Amount:         "Amount",
			Total:          "Total",
			PaymentInfo:    "Payment Information",
			BankDetails:    "Bank Details",
			AccountHolder:  "Account Holder",
			IBAN:           "IBAN",
			Reference:      "Reference",
			PleasePayBy:    "Please pay by",
			ThankYou:       "Thank you for your payment!",
			ArchivedNotice: "ARCHIVED - This invoice has been archived and is no longer valid",
			NormalPower:    "Normal Power",
			SolarPower:     "Solar Power",
			CarCharging:    "Car Charging",
			SharedMeter:    "Shared Meter",
			CustomItem:     "Custom Item",
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