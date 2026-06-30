package services

// Translations contains all text that appears on invoices
type InvoiceTranslations struct {
	Invoice        string
	Status         string
	BillTo         string
	InvoiceDetails string
	Period         string
	Generated      string
	Description    string
	Amount         string
	Subtotal       string
	VAT            string
	ThereofVAT     string
	Total          string
	PaymentInfo    string
	BankDetails    string
	AccountHolder  string
	IBAN           string
	Reference      string
	PleasePayBy    string
	ThankYou       string
	ArchivedNotice string

	// Item type translations
	NormalPower  string
	SolarPower   string
	BatteryPower string
	CarCharging  string
	SharedMeter  string
	CustomItem   string

	// NEW: Additional translations for item descriptions
	ApartmentMeter     string
	OldReading         string
	NewReading         string
	Consumption        string
	NormalPowerGrid    string
	SolarMode          string
	PriorityMode       string
	SolarCharging      string
	GridCharging       string
	AdditionalServices string
	TotalConsumption   string
	YourShare          string
	SplitEqually       string
	SplitByUnits       string
	CustomSplit        string
	Among              string
	Users              string
	Of                 string
	TotalUnits         string

	// QR Code section translations
	ReceiptSection   string // "Empfangsschein" / "Receipt" / "Section de réception" / "Sezione ricevuta"
	PaymentPart      string // "Zahlteil" / "Payment part" / "Section paiement" / "Sezione pagamento"
	AccountPayableTo string // "Konto / Zahlbar an" / "Account / Payable to" / "Compte / Payable à" / "Conto / Pagabile a"
	PayableBy        string // "Zahlbar durch" / "Payable by" / "Payable par" / "Pagabile da"
	Currency         string // "Währung" / "Currency" / "Monnaie" / "Valuta"
	AmountLabel      string // "Betrag" / "Amount" / "Montant" / "Importo"
	AcceptancePoint  string // "Annahmestelle" / "Acceptance point" / "Point d'acceptation" / "Punto di accettazione"
	AdditionalInfo   string // "Zusätzliche Informationen" / "Additional information" / "Informations supplémentaires" / "Informazioni aggiuntive"
	InvoiceLabel     string // "Invoice" / "Rechnung" / "Facture" / "Fattura"

	PartialPeriod string

	// Warning shown on the invoice when a charger's cumulative counter went
	// backwards (reset/glitch) during the billing period.
	ChargerCounterResetWarning string

	// NEW: Frequency translations for custom line items
	FrequencyOnce      string
	FrequencyMonthly   string
	FrequencyQuarterly string
	FrequencyYearly    string

	// NEW: Category translations for custom line items
	CategoryMeterRent   string
	CategoryMaintenance string
	CategoryService     string
	CategoryOther       string

	// NEW: Proration description translations
	Days     string
	OfPeriod string
}

// GetTranslations returns translations for the specified language
func GetTranslations(language string) InvoiceTranslations {
	switch language {
	case "de": // German
		return InvoiceTranslations{
			Invoice:                    "Rechnung",
			Status:                     "Status",
			BillTo:                     "Rechnungsempfänger",
			InvoiceDetails:             "Rechnungsdetails",
			Period:                     "Zeitraum",
			Generated:                  "Erstellt",
			Description:                "Beschreibung",
			Amount:                     "Betrag",
			Subtotal:                   "Zwischensumme",
			VAT:                        "MwSt.",
			ThereofVAT:                 "davon MwSt.",
			Total:                      "Gesamt",
			PaymentInfo:                "Zahlungsinformationen",
			BankDetails:                "Bankverbindung",
			AccountHolder:              "Kontoinhaber",
			IBAN:                       "IBAN",
			Reference:                  "Referenz",
			PleasePayBy:                "Bitte zahlen Sie bis",
			ThankYou:                   "Vielen Dank für Ihre Zahlung!",
			ArchivedNotice:             "ARCHIVIERT - Diese Rechnung wurde archiviert und ist nicht mehr gültig",
			NormalPower:                "Normaler Strom",
			SolarPower:                 "Solarstrom",
			BatteryPower:               "Batteriestrom",
			CarCharging:                "Autoladen",
			SharedMeter:                "Gemeinsamer Zähler",
			CustomItem:                 "Benutzerdefinierter Posten",
			ApartmentMeter:             "Wohnungszähler",
			OldReading:                 "Alt",
			NewReading:                 "Neu",
			Consumption:                "Verbrauch",
			NormalPowerGrid:            "Normaler Strom (Netz)",
			SolarMode:                  "Solarmodus",
			PriorityMode:               "Prioritätsmodus",
			SolarCharging:              "Solarladen",
			GridCharging:               "Netzladen",
			AdditionalServices:         "Zusätzliche Dienstleistungen",
			TotalConsumption:           "Gesamtverbrauch",
			YourShare:                  "Ihr Anteil",
			SplitEqually:               "Gleichmäßig aufgeteilt",
			SplitByUnits:               "Aufgeteilt nach Einheiten",
			CustomSplit:                "Benutzerdefinierte Aufteilung",
			Among:                      "unter",
			Users:                      "Benutzer",
			Of:                         "von",
			TotalUnits:                 "Gesamteinheiten",
			ReceiptSection:             "Empfangsschein",
			PaymentPart:                "Zahlteil",
			AccountPayableTo:           "Konto / Zahlbar an",
			PayableBy:                  "Zahlbar durch",
			Currency:                   "Währung",
			AmountLabel:                "Betrag",
			AcceptancePoint:            "Annahmestelle",
			AdditionalInfo:             "Zusätzliche Informationen",
			InvoiceLabel:               "Rechnung",
			PartialPeriod:              "Anteiliger Zeitraum",
			ChargerCounterResetWarning: "Hinweis: Der Zählerstand der Ladestation wurde in diesem Zeitraum zurückgesetzt (Reset/Störung). Die Ladekosten wurden konservativ berechnet – bitte vor dem Versand prüfen.",
			// Frequency translations
			FrequencyOnce:      "Einmalig",
			FrequencyMonthly:   "Monatlich",
			FrequencyQuarterly: "Vierteljährlich",
			FrequencyYearly:    "Jährlich",
			// Category translations
			CategoryMeterRent:   "Zählermiete",
			CategoryMaintenance: "Wartung",
			CategoryService:     "Service",
			CategoryOther:       "Sonstiges",
			// Proration translations
			Days:     "Tage",
			OfPeriod: "des Zeitraums",
		}
	case "fr": // French
		return InvoiceTranslations{
			Invoice:                    "Facture",
			Status:                     "Statut",
			BillTo:                     "Facturé à",
			InvoiceDetails:             "Détails de la facture",
			Period:                     "Période",
			Generated:                  "Générée le",
			Description:                "Description",
			Amount:                     "Montant",
			Subtotal:                   "Sous-total",
			VAT:                        "TVA",
			ThereofVAT:                 "dont TVA",
			Total:                      "Total",
			PaymentInfo:                "Informations de paiement",
			BankDetails:                "Coordonnées bancaires",
			AccountHolder:              "Titulaire du compte",
			IBAN:                       "IBAN",
			Reference:                  "Référence",
			PleasePayBy:                "Veuillez payer avant le",
			ThankYou:                   "Merci pour votre paiement!",
			ArchivedNotice:             "ARCHIVÉ - Cette facture a été archivée et n'est plus valide",
			NormalPower:                "Électricité normale",
			SolarPower:                 "Énergie solaire",
			BatteryPower:               "Énergie de la batterie",
			CarCharging:                "Recharge de voiture",
			SharedMeter:                "Compteur partagé",
			CustomItem:                 "Article personnalisé",
			ApartmentMeter:             "Compteur d'appartement",
			OldReading:                 "Ancien",
			NewReading:                 "Nouveau",
			Consumption:                "Consommation",
			NormalPowerGrid:            "Électricité normale (réseau)",
			SolarMode:                  "Mode solaire",
			PriorityMode:               "Mode prioritaire",
			SolarCharging:              "Recharge solaire",
			GridCharging:               "Recharge réseau",
			AdditionalServices:         "Services supplémentaires",
			TotalConsumption:           "Consommation totale",
			YourShare:                  "Votre part",
			SplitEqually:               "Divisé également",
			SplitByUnits:               "Divisé par unités",
			CustomSplit:                "Division personnalisée",
			Among:                      "parmi",
			Users:                      "utilisateurs",
			Of:                         "de",
			TotalUnits:                 "unités totales",
			ReceiptSection:             "Récépissé",
			PaymentPart:                "Section paiement",
			AccountPayableTo:           "Compte / Payable à",
			PayableBy:                  "Payable par",
			Currency:                   "Monnaie",
			AmountLabel:                "Montant",
			AcceptancePoint:            "Point de dépot",
			AdditionalInfo:             "Informations supplémentaires",
			InvoiceLabel:               "Facture",
			PartialPeriod:              "Période partielle",
			ChargerCounterResetWarning: "Remarque : le compteur de la borne de recharge a été réinitialisé pendant cette période (reset/anomalie). Les coûts de recharge ont été calculés de manière prudente – veuillez vérifier avant l'envoi.",
			// Frequency translations
			FrequencyOnce:      "Une fois",
			FrequencyMonthly:   "Mensuel",
			FrequencyQuarterly: "Trimestriel",
			FrequencyYearly:    "Annuel",
			// Category translations
			CategoryMeterRent:   "Location compteur",
			CategoryMaintenance: "Maintenance",
			CategoryService:     "Service",
			CategoryOther:       "Autre",
			// Proration translations
			Days:     "jours",
			OfPeriod: "de la période",
		}
	case "it": // Italian
		return InvoiceTranslations{
			Invoice:                    "Fattura",
			Status:                     "Stato",
			BillTo:                     "Fatturato a",
			InvoiceDetails:             "Dettagli fattura",
			Period:                     "Periodo",
			Generated:                  "Generata il",
			Description:                "Descrizione",
			Amount:                     "Importo",
			Subtotal:                   "Subtotale",
			VAT:                        "IVA",
			ThereofVAT:                 "di cui IVA",
			Total:                      "Totale",
			PaymentInfo:                "Informazioni di pagamento",
			BankDetails:                "Dati bancari",
			AccountHolder:              "Titolare del conto",
			IBAN:                       "IBAN",
			Reference:                  "Riferimento",
			PleasePayBy:                "Si prega di pagare entro",
			ThankYou:                   "Grazie per il pagamento!",
			ArchivedNotice:             "ARCHIVIATO - Questa fattura è stata archiviata e non è più valida",
			NormalPower:                "Energia normale",
			SolarPower:                 "Energia solare",
			BatteryPower:               "Energia della batteria",
			CarCharging:                "Ricarica auto",
			SharedMeter:                "Contatore condiviso",
			CustomItem:                 "Voce personalizzata",
			ApartmentMeter:             "Contatore appartamento",
			OldReading:                 "Vecchio",
			NewReading:                 "Nuovo",
			Consumption:                "Consumo",
			NormalPowerGrid:            "Energia normale (rete)",
			SolarMode:                  "Modalità solare",
			PriorityMode:               "Modalità prioritaria",
			SolarCharging:              "Ricarica solare",
			GridCharging:               "Ricarica rete",
			AdditionalServices:         "Servizi aggiuntivi",
			TotalConsumption:           "Consumo totale",
			YourShare:                  "La tua quota",
			SplitEqually:               "Diviso equamente",
			SplitByUnits:               "Diviso per unità",
			CustomSplit:                "Divisione personalizzata",
			Among:                      "tra",
			Users:                      "utenti",
			Of:                         "di",
			TotalUnits:                 "unità totali",
			ReceiptSection:             "Ricevuta",
			PaymentPart:                "Sezione pagamento",
			AccountPayableTo:           "Conto / Pagabile a",
			PayableBy:                  "Pagabile da",
			Currency:                   "Valuta",
			AmountLabel:                "Importo",
			AcceptancePoint:            "Punto di accettazione",
			AdditionalInfo:             "Informazioni supplementari",
			InvoiceLabel:               "Fattura",
			PartialPeriod:              "Periodo parziale",
			ChargerCounterResetWarning: "Nota: il contatore della stazione di ricarica è stato azzerato in questo periodo (reset/anomalia). I costi di ricarica sono stati calcolati in modo prudente – verificare prima dell'invio.",
			// Frequency translations
			FrequencyOnce:      "Una tantum",
			FrequencyMonthly:   "Mensile",
			FrequencyQuarterly: "Trimestrale",
			FrequencyYearly:    "Annuale",
			// Category translations
			CategoryMeterRent:   "Noleggio contatore",
			CategoryMaintenance: "Manutenzione",
			CategoryService:     "Servizio",
			CategoryOther:       "Altro",
			// Proration translations
			Days:     "giorni",
			OfPeriod: "del periodo",
		}
	default: // English
		return InvoiceTranslations{
			Invoice:                    "Invoice",
			Status:                     "Status",
			BillTo:                     "Bill To",
			InvoiceDetails:             "Invoice Details",
			Period:                     "Period",
			Generated:                  "Generated",
			Description:                "Description",
			Amount:                     "Amount",
			Subtotal:                   "Subtotal",
			VAT:                        "VAT",
			ThereofVAT:                 "thereof VAT",
			Total:                      "Total",
			PaymentInfo:                "Payment Information",
			BankDetails:                "Bank Details",
			AccountHolder:              "Account Holder",
			IBAN:                       "IBAN",
			Reference:                  "Reference",
			PleasePayBy:                "Please pay by",
			ThankYou:                   "Thank you for your payment!",
			ArchivedNotice:             "ARCHIVED - This invoice has been archived and is no longer valid",
			NormalPower:                "Normal Power",
			SolarPower:                 "Solar Power",
			BatteryPower:               "Battery Power",
			CarCharging:                "Car Charging",
			SharedMeter:                "Shared Meter",
			CustomItem:                 "Custom Item",
			ApartmentMeter:             "Apartment Meter",
			OldReading:                 "Old",
			NewReading:                 "New",
			Consumption:                "Consumption",
			NormalPowerGrid:            "Normal Power (Grid)",
			SolarMode:                  "Solar Mode",
			PriorityMode:               "Priority Mode",
			SolarCharging:              "Solar Charging",
			GridCharging:               "Grid Charging",
			AdditionalServices:         "Additional Services",
			TotalConsumption:           "Total consumption",
			YourShare:                  "Your share",
			SplitEqually:               "Split equally",
			SplitByUnits:               "Split by units",
			CustomSplit:                "Custom split",
			Among:                      "among",
			Users:                      "users",
			Of:                         "of",
			TotalUnits:                 "total units",
			ReceiptSection:             "Receipt",
			PaymentPart:                "Payment part",
			AccountPayableTo:           "Account / Payable to",
			PayableBy:                  "Payable by",
			Currency:                   "Currency",
			AmountLabel:                "Amount",
			AcceptancePoint:            "Acceptance point",
			AdditionalInfo:             "Additional information",
			InvoiceLabel:               "Invoice",
			PartialPeriod:              "Partial Period",
			ChargerCounterResetWarning: "Note: the charger's meter counter was reset during this period (reset/glitch). Charging costs were calculated conservatively – please review before sending.",
			// Frequency translations
			FrequencyOnce:      "One-time",
			FrequencyMonthly:   "Monthly",
			FrequencyQuarterly: "Quarterly",
			FrequencyYearly:    "Yearly",
			// Category translations
			CategoryMeterRent:   "Meter Rental",
			CategoryMaintenance: "Maintenance",
			CategoryService:     "Service",
			CategoryOther:       "Other",
			// Proration translations
			Days:     "days",
			OfPeriod: "of period",
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
	case "battery_power":
		return translations.BatteryPower
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
