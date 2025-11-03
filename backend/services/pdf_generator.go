package services

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/jung-kurt/gofpdf"
	"github.com/skip2/go-qrcode"
)

type PDFGenerator struct {
	db *sql.DB
}

func NewPDFGenerator(db *sql.DB) *PDFGenerator {
	return &PDFGenerator{db: db}
}

type SenderInfo struct {
	Name    string
	Address string
	City    string
	Zip     string
	Country string
}

type BankingInfo struct {
	Name          string
	IBAN          string
	AccountHolder string
}

func (pg *PDFGenerator) GenerateInvoicePDF(invoice interface{}, senderInfo SenderInfo, bankingInfo BankingInfo) (string, error) {
	// Type assertion to get invoice details
	inv, ok := invoice.(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("invalid invoice format")
	}

	// Create PDF
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 15, 15)
	pdf.AddPage()

	// Add Header
	pdf.SetFont("Arial", "B", 24)
	pdf.SetTextColor(0, 123, 255)
	pdf.Cell(0, 10, "Invoice")
	pdf.Ln(8)

	// Invoice Number
	pdf.SetFont("Arial", "", 10)
	pdf.SetTextColor(100, 100, 100)
	invoiceNumber := fmt.Sprintf("%v", inv["invoice_number"])
	pdf.Cell(0, 6, "#"+invoiceNumber)
	pdf.Ln(10)

	// Status Badge
	status := fmt.Sprintf("%v", inv["status"])
	pdf.SetFillColor(212, 237, 218)
	pdf.SetTextColor(21, 87, 36)
	pdf.SetFont("Arial", "B", 9)
	pdf.CellFormat(30, 6, status, "", 0, "C", true, 0, "")
	pdf.Ln(12)

	// Sender Info (right side)
	pdf.SetFont("Arial", "B", 10)
	pdf.SetTextColor(0, 0, 0)
	if senderInfo.Name != "" {
		pdf.Cell(0, 5, senderInfo.Name)
		pdf.Ln(4)
		pdf.SetFont("Arial", "", 9)
		if senderInfo.Address != "" {
			pdf.Cell(0, 4, senderInfo.Address)
			pdf.Ln(4)
		}
		if senderInfo.Zip != "" || senderInfo.City != "" {
			pdf.Cell(0, 4, senderInfo.Zip+" "+senderInfo.City)
			pdf.Ln(4)
		}
		if senderInfo.Country != "" {
			pdf.Cell(0, 4, senderInfo.Country)
			pdf.Ln(8)
		}
	}

	// Bill To Section
	pdf.SetFont("Arial", "B", 10)
	pdf.SetTextColor(100, 100, 100)
	pdf.Cell(0, 6, "BILL TO")
	pdf.Ln(6)

	pdf.SetFont("Arial", "", 10)
	pdf.SetTextColor(0, 0, 0)
	
	// Get user info
	if user, ok := inv["user"].(map[string]interface{}); ok {
		userName := fmt.Sprintf("%v %v", user["first_name"], user["last_name"])
		pdf.SetFont("Arial", "B", 10)
		pdf.Cell(0, 5, userName)
		pdf.Ln(4)
		
		pdf.SetFont("Arial", "", 9)
		if addr, ok := user["address_street"].(string); ok && addr != "" {
			pdf.Cell(0, 4, addr)
			pdf.Ln(4)
		}
		if zip, ok := user["address_zip"].(string); ok {
			if city, ok := user["address_city"].(string); ok {
				pdf.Cell(0, 4, zip+" "+city)
				pdf.Ln(4)
			}
		}
		if email, ok := user["email"].(string); ok && email != "" {
			pdf.Cell(0, 4, email)
			pdf.Ln(8)
		}
	}

	// Invoice Details
	pdf.SetFont("Arial", "B", 10)
	pdf.SetTextColor(100, 100, 100)
	pdf.Cell(0, 6, "INVOICE DETAILS")
	pdf.Ln(6)

	pdf.SetFont("Arial", "", 9)
	pdf.SetTextColor(0, 0, 0)
	
	periodStart := fmt.Sprintf("%v", inv["period_start"])
	periodEnd := fmt.Sprintf("%v", inv["period_end"])
	pdf.Cell(0, 4, "Period: "+periodStart+" to "+periodEnd)
	pdf.Ln(4)
	
	generatedAt := fmt.Sprintf("%v", inv["generated_at"])
	pdf.Cell(0, 4, "Generated: "+generatedAt)
	pdf.Ln(10)

	// Items Table
	pdf.SetFillColor(249, 249, 249)
	pdf.SetFont("Arial", "B", 9)
	pdf.CellFormat(130, 8, "Description", "B", 0, "L", true, 0, "")
	pdf.CellFormat(50, 8, "Amount", "B", 0, "R", true, 0, "")
	pdf.Ln(8)

	// Add items
	pdf.SetFont("Arial", "", 9)
	if items, ok := inv["items"].([]interface{}); ok {
		for _, item := range items {
			if itemMap, ok := item.(map[string]interface{}); ok {
				description := fmt.Sprintf("%v", itemMap["description"])
				totalPrice := 0.0
				if tp, ok := itemMap["total_price"].(float64); ok {
					totalPrice = tp
				}
				itemType := fmt.Sprintf("%v", itemMap["item_type"])

				// Different formatting based on item type
				if itemType == "meter_info" || itemType == "charging_header" {
					pdf.SetFont("Arial", "B", 9)
					pdf.Cell(180, 5, description)
					pdf.Ln(5)
				} else if itemType == "meter_reading_from" || itemType == "meter_reading_to" || 
				           itemType == "total_consumption" || itemType == "separator" {
					pdf.SetFont("Arial", "", 8)
					pdf.SetTextColor(100, 100, 100)
					pdf.Cell(180, 4, description)
					pdf.Ln(4)
					pdf.SetTextColor(0, 0, 0)
				} else if totalPrice > 0 {
					pdf.SetFont("Arial", "B", 9)
					pdf.CellFormat(130, 6, description, "", 0, "L", false, 0, "")
					currency := fmt.Sprintf("%v", inv["currency"])
					pdf.CellFormat(50, 6, fmt.Sprintf("%s %.2f", currency, totalPrice), "", 0, "R", false, 0, "")
					pdf.Ln(6)
				}
			}
		}
	}

	pdf.Ln(5)

	// Total Section
	pdf.SetFillColor(249, 249, 249)
	pdf.SetFont("Arial", "B", 18)
	totalAmount := 0.0
	if ta, ok := inv["total_amount"].(float64); ok {
		totalAmount = ta
	}
	currency := fmt.Sprintf("%v", inv["currency"])
	pdf.CellFormat(0, 15, fmt.Sprintf("Total: %s %.2f", currency, totalAmount), "", 0, "R", true, 0, "")
	pdf.Ln(20)

	// Payment Details (if banking info provided)
	if bankingInfo.IBAN != "" && bankingInfo.AccountHolder != "" {
		pdf.SetFont("Arial", "B", 10)
		pdf.SetTextColor(0, 0, 0)
		pdf.Cell(0, 6, "PAYMENT DETAILS")
		pdf.Ln(6)

		pdf.SetFont("Arial", "", 9)
		pdf.Cell(0, 4, "Bank: "+bankingInfo.Name)
		pdf.Ln(4)
		pdf.Cell(0, 4, "Account Holder: "+bankingInfo.AccountHolder)
		pdf.Ln(4)
		pdf.Cell(0, 4, "IBAN: "+bankingInfo.IBAN)
		pdf.Ln(10)

		// Generate QR Code Page
		qrData := pg.generateSwissQRData(inv, senderInfo, bankingInfo)
		if qrData != "" {
			pdf.AddPage()
			
			// QR Code Title
			pdf.SetFont("Arial", "B", 18)
			pdf.SetTextColor(0, 123, 255)
			pdf.Ln(20)
			pdf.Cell(0, 10, "Swiss QR Code")
			pdf.Ln(15)

			// Generate QR code image
			tempQR := filepath.Join(os.TempDir(), fmt.Sprintf("qr_%s.png", invoiceNumber))
			err := qrcode.WriteFile(qrData, qrcode.Medium, 280, tempQR)
			if err == nil {
				// Add QR code to PDF
				pdf.ImageOptions(tempQR, 55, 60, 100, 100, false, gofpdf.ImageOptions{ImageType: "PNG"}, 0, "")
				
				// Clean up temp file
				defer os.Remove(tempQR)
				
				// Payment info below QR
				pdf.Ln(110)
				pdf.SetFont("Arial", "", 10)
				pdf.SetTextColor(0, 0, 0)
				pdf.Cell(0, 5, "Invoice: "+invoiceNumber)
				pdf.Ln(5)
				pdf.Cell(0, 5, fmt.Sprintf("Amount: %s %.2f", currency, totalAmount))
				pdf.Ln(5)
				pdf.Cell(0, 5, "IBAN: "+bankingInfo.IBAN)
				pdf.Ln(5)
				pdf.Cell(0, 5, "Account Holder: "+bankingInfo.AccountHolder)
			} else {
				log.Printf("Failed to generate QR code: %v", err)
			}
		}
	}

	// Save PDF
	invoicesDir := "/home/pi/zev-billing/invoices"
	if err := os.MkdirAll(invoicesDir, 0755); err != nil {
		// Try local directory if home directory fails
		invoicesDir = "./invoices"
		os.MkdirAll(invoicesDir, 0755)
	}

	filename := fmt.Sprintf("%s.pdf", invoiceNumber)
	filepath := filepath.Join(invoicesDir, filename)

	err := pdf.OutputFileAndClose(filepath)
	if err != nil {
		return "", fmt.Errorf("failed to save PDF: %v", err)
	}

	log.Printf("✓ Generated PDF: %s", filename)
	return filename, nil
}

func (pg *PDFGenerator) generateSwissQRData(inv map[string]interface{}, sender SenderInfo, banking BankingInfo) string {
	// Validate IBAN
	iban := banking.IBAN
	iban = stripSpaces(iban)
	
	if len(iban) < 15 || (iban[:2] != "CH" && iban[:2] != "LI") {
		log.Printf("Invalid IBAN format: %s", iban)
		return ""
	}

	// Get invoice details
	invoiceNumber := fmt.Sprintf("%v", inv["invoice_number"])
	totalAmount := 0.0
	if ta, ok := inv["total_amount"].(float64); ok {
		totalAmount = ta
	}
	currency := fmt.Sprintf("%v", inv["currency"])
	if currency == "" {
		currency = "CHF"
	}

	// Parse addresses
	senderStreet, senderHouseNo := parseAddress(sender.Address)
	
	userStreet := ""
	userHouseNo := ""
	if user, ok := inv["user"].(map[string]interface{}); ok {
		if addr, ok := user["address_street"].(string); ok {
			userStreet, userHouseNo = parseAddress(addr)
		}
	}

	// Build QR data (31 lines)
	qrParts := []string{
		"SPC",                                    // 1: QR Type
		"0200",                                   // 2: Version
		"1",                                      // 3: Coding
		iban,                                     // 4: IBAN
		"S",                                      // 5: Creditor Address Type
		truncate(banking.AccountHolder, 70),     // 6: Creditor Name
		truncate(senderStreet, 70),              // 7: Creditor Street
		truncate(senderHouseNo, 16),             // 8: Creditor House No
		truncate(sender.Zip, 16),                // 9: Creditor Postal Code
		truncate(sender.City, 35),               // 10: Creditor City
		truncate(sender.Country, 2),             // 11: Creditor Country
		"",                                       // 12: Ultimate Creditor Address Type
		"",                                       // 13: Ultimate Creditor Name
		"",                                       // 14: Ultimate Creditor Street
		"",                                       // 15: Ultimate Creditor House No
		"",                                       // 16: Ultimate Creditor Postal Code
		"",                                       // 17: Ultimate Creditor City
		"",                                       // 18: Ultimate Creditor Country
		fmt.Sprintf("%.2f", totalAmount),        // 19: Amount
		truncate(currency, 3),                   // 20: Currency
		"S",                                      // 21: Debtor Address Type
		"",                                       // 22: Debtor Name (filled below)
		truncate(userStreet, 70),                // 23: Debtor Street
		truncate(userHouseNo, 16),               // 24: Debtor House No
		"",                                       // 25: Debtor Postal Code (filled below)
		"",                                       // 26: Debtor City (filled below)
		"",                                       // 27: Debtor Country (filled below)
		"NON",                                    // 28: Reference Type
		"",                                       // 29: Reference
		truncate("Invoice "+invoiceNumber, 140), // 30: Additional Information
		"EPD",                                    // 31: End Payment Data
	}

	// Fill debtor info
	if user, ok := inv["user"].(map[string]interface{}); ok {
		firstName := fmt.Sprintf("%v", user["first_name"])
		lastName := fmt.Sprintf("%v", user["last_name"])
		qrParts[21] = truncate(firstName+" "+lastName, 70)
		
		if zip, ok := user["address_zip"].(string); ok {
			qrParts[24] = truncate(zip, 16)
		}
		if city, ok := user["address_city"].(string); ok {
			qrParts[25] = truncate(city, 35)
		}
		if country, ok := user["address_country"].(string); ok {
			qrParts[26] = truncate(country, 2)
		} else {
			qrParts[26] = "CH"
		}
	}

	qrData := ""
	for i, part := range qrParts {
		qrData += part
		if i < len(qrParts)-1 {
			qrData += "\r\n"
		}
	}

	return qrData
}

func stripSpaces(s string) string {
	result := ""
	for _, c := range s {
		if c != ' ' {
			result += string(c)
		}
	}
	return result
}

func parseAddress(address string) (street, houseNo string) {
	// Try to split address into street and house number
	// Format: "Main Street 123" or "Main Street 123a"
	if address == "" {
		return "", ""
	}

	// Simple regex-like parsing
	lastSpace := -1
	for i := len(address) - 1; i >= 0; i-- {
		if address[i] == ' ' {
			lastSpace = i
			break
		}
	}

	if lastSpace > 0 {
		possibleNumber := address[lastSpace+1:]
		if len(possibleNumber) > 0 && (possibleNumber[0] >= '0' && possibleNumber[0] <= '9') {
			return address[:lastSpace], possibleNumber
		}
	}

	return address, ""
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen]
}