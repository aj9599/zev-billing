package services

import (
	"database/sql"
	"fmt"
	"html/template"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
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

	invoiceNumber := fmt.Sprintf("%v", inv["invoice_number"])

	// Generate HTML content
	htmlContent, err := pg.generateHTML(inv, senderInfo, bankingInfo)
	if err != nil {
		return "", fmt.Errorf("failed to generate HTML: %v", err)
	}

	// Create invoices directory
	invoicesDir := "/home/pi/zev-billing/backend/invoices"
	if err := os.MkdirAll(invoicesDir, 0755); err != nil {
		// Try local directory if home directory fails
		invoicesDir = "./invoices"
		os.MkdirAll(invoicesDir, 0755)
	}

	filename := fmt.Sprintf("%s.pdf", invoiceNumber)
	pdfPath := filepath.Join(invoicesDir, filename)

	// Save HTML temporarily
	tempHTML := filepath.Join(os.TempDir(), fmt.Sprintf("invoice_%s.html", invoiceNumber))
	if err := os.WriteFile(tempHTML, []byte(htmlContent), 0644); err != nil {
		return "", fmt.Errorf("failed to write HTML: %v", err)
	}
	defer os.Remove(tempHTML)

	// Convert HTML to PDF using wkhtmltopdf or chromium
	if err := pg.convertHTMLToPDF(tempHTML, pdfPath); err != nil {
		return "", fmt.Errorf("failed to convert to PDF: %v", err)
	}

	log.Printf("Generated PDF: %s", filename)
	return filename, nil
}

func (pg *PDFGenerator) convertHTMLToPDF(htmlPath, pdfPath string) error {
	// Try wkhtmltopdf first (better for production)
	cmd := exec.Command("wkhtmltopdf",
		"--page-size", "A4",
		"--margin-top", "15mm",
		"--margin-right", "15mm",
		"--margin-bottom", "15mm",
		"--margin-left", "15mm",
		"--enable-local-file-access",
		"--print-media-type",
		"--no-pdf-compression",
		"--disable-smart-shrinking",
		"--footer-center", "",
		"--footer-left", "",
		"--footer-right", "",
		"--header-center", "",
		"--header-left", "",
		"--header-right", "",
		htmlPath,
		pdfPath,
	)

	output, err := cmd.CombinedOutput()
	if err == nil {
		return nil
	}

	log.Printf("wkhtmltopdf not available: %v, trying chromium...", err)

	// Try chromium/chrome as fallback
	chromiumCmds := []string{"chromium-browser", "chromium", "google-chrome", "chrome"}

	for _, chromiumCmd := range chromiumCmds {
		cmd = exec.Command(chromiumCmd,
			"--headless",
			"--disable-gpu",
			"--print-to-pdf="+pdfPath,
			"--no-margins",
			"--no-pdf-header-footer",
			htmlPath,
		)

		output, err = cmd.CombinedOutput()
		if err == nil {
			return nil
		}
	}

	return fmt.Errorf("no PDF converter available (tried wkhtmltopdf and chromium): %s", string(output))
}

func (pg *PDFGenerator) generateHTML(inv map[string]interface{}, sender SenderInfo, banking BankingInfo) (string, error) {
	invoiceNumber := fmt.Sprintf("%v", inv["invoice_number"])
	status := fmt.Sprintf("%v", inv["status"])
	currency := fmt.Sprintf("%v", inv["currency"])
	if currency == "" {
		currency = "CHF"
	}

	// Get user language and load translations
	userLanguage := "de" // Default to German
	if user, ok := inv["user"].(map[string]interface{}); ok {
		if lang, ok := user["language"].(string); ok && lang != "" {
			userLanguage = lang
		}
	}
	tr := GetTranslations(userLanguage)

	totalAmount := 0.0
	if ta, ok := inv["total_amount"].(float64); ok {
		totalAmount = ta
	}

	periodStart := fmt.Sprintf("%v", inv["period_start"])
	periodEnd := fmt.Sprintf("%v", inv["period_end"])
	generatedAt := fmt.Sprintf("%v", inv["generated_at"])

	// Get status colors
	statusColors := getStatusColors(status)

	// Check if user is archived
	isArchived := false
	var userInfo string
	if user, ok := inv["user"].(map[string]interface{}); ok {
		firstName := fmt.Sprintf("%v", user["first_name"])
		lastName := fmt.Sprintf("%v", user["last_name"])
		email := fmt.Sprintf("%v", user["email"])
		street := fmt.Sprintf("%v", user["address_street"])
		zip := fmt.Sprintf("%v", user["address_zip"])
		city := fmt.Sprintf("%v", user["address_city"])

		if isActive, ok := user["is_active"].(bool); ok {
			isArchived = !isActive
		}

		archivedLabel := ""
		if isArchived {
			archivedLabel = " <em>(Archived)</em>"
		}

		userInfo = fmt.Sprintf(`<strong>%s %s</strong>%s<br>%s<br>%s %s<br>%s`,
			firstName, lastName, archivedLabel, street, zip, city, email)
	}

	// Generate items HTML
	itemsHTML := ""
	if items, ok := inv["items"].([]interface{}); ok {
		for _, item := range items {
			if itemMap, ok := item.(map[string]interface{}); ok {
				itemsHTML += pg.generateItemHTML(itemMap, currency)
			}
		}
	}

	// Generate QR code data
	qrData := ""
	hasValidQR := false
	if banking.IBAN != "" && banking.AccountHolder != "" {
		qrData = pg.generateSwissQRData(inv, sender, banking)
		hasValidQR = qrData != ""
	}

	// Archived banner
	archivedBanner := ""
	if isArchived {
		archivedBanner = `
		<div class="archived-banner">
			ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ARCHIVED USER - This invoice is for an archived user
		</div>`
	}

	// Sender info section
	senderSection := ""
	if sender.Name != "" {
		senderSection = fmt.Sprintf(`
			<div class="header-right">
				<strong>%s</strong>
				%s<br>
				%s %s<br>
				%s
			</div>`,
			sender.Name,
			sender.Address,
			sender.Zip, sender.City,
			sender.Country,
		)
	}

	// Payment details section
	paymentSection := ""
	if banking.IBAN != "" && banking.AccountHolder != "" {
		paymentSection = fmt.Sprintf(`
		<div class="payment-details-bottom">
			<h4>%s</h4>
			<p><strong>%s:</strong> %s</p>
			<p><strong>%s:</strong> %s</p>
			<p><strong>%s:</strong> %s</p>
			<div class="footer-timestamp">
				<p>%s: %s</p>
			</div>
		</div>`,
			tr.PaymentInfo,
			tr.BankDetails,
			banking.Name,
			tr.AccountHolder,
			banking.AccountHolder,
			tr.IBAN,
			formatIBAN(banking.IBAN),
			tr.Generated,
			time.Now().Format("02.01.2006 15:04"),
		)
	}

	// QR code page
	qrPage := ""
	if banking.IBAN != "" && banking.AccountHolder != "" {
		qrCodeContent := ""
		if hasValidQR {
			qrCodeContent = fmt.Sprintf(`
				<div class="qr-code-wrapper">
					<img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=%s" alt="QR Code" style="width: 46mm; height: 46mm;">
				</div>`,
				template.URLQueryEscaper(qrData),
			)
		} else {
			qrCodeContent = `
				<div style="padding: 10px; color: #dc3545; text-align: center;">
					<p style="margin: 0; font-size: 9pt;">QR Code could not be generated</p>
				</div>`
		}

		// Format user info for display (plain text, line breaks)
		userName := ""
		userStreet := ""
		userLocation := ""
		if user, ok := inv["user"].(map[string]interface{}); ok {
			firstName := fmt.Sprintf("%v", user["first_name"])
			lastName := fmt.Sprintf("%v", user["last_name"])
			userName = fmt.Sprintf("%s %s", firstName, lastName)
			street := fmt.Sprintf("%v", user["address_street"])
			zip := fmt.Sprintf("%v", user["address_zip"])
			city := fmt.Sprintf("%v", user["address_city"])
			userStreet = street
			userLocation = fmt.Sprintf("%s %s", zip, city)
		}

		// Format sender info for display        
		senderName := banking.AccountHolder
        senderStreet := sender.Address
        senderLocation := fmt.Sprintf("%s %s", sender.Zip, sender.City)

		// Build QR sections WITH TRANSLATIONS
		qrPage = fmt.Sprintf(`
		<div class="page qr-page">
			<div class="qr-container">
				<div class="qr-left">
					<div class="qr-section-title">%s</div>
					<div class="qr-info">
						<strong>%s</strong>
						<p>%s</p>
						<p>%s</p>
						<p>%s</p>
						<p>%s</p>
					</div>
					<div class="qr-info">
						<strong>%s</strong>
						<p>%s</p>
						<p>%s</p>
						<p>%s</p>
					</div>
					<div class="qr-amount-box">
						<div style="display: grid; grid-template-columns: 12mm auto;">
                            <p style="font-size: 6pt; font-weight: bold; margin: 0;">%s</p>
                            <p style="font-size: 6pt; font-weight: bold; margin: 0;">%s</p>
                            <p style="font-size: 8pt; font-weight: bold; margin: 0;">%s</p>
                            <p style="font-size: 8pt; font-weight: bold; margin: 0;">%.2f</p>
                        </div>
					</div>
					<div class="qr-acceptance-point">%s</div>
				</div>
				<div class="qr-right">
					<div class="qr-section-title">%s</div>
					<div class="qr-right-layout">
						<div class="qr-code-column">
							%s
						</div>
						<div class="qr-info-column">
							<div class="qr-info">
								<strong>%s</strong>
								<p>%s</p>
								<p>%s</p>
								<p>%s</p>
								<p>%s</p>
							</div>
							<div class="qr-info">
								<strong>%s</strong>
								<p>%s %s</p>
							</div>
							<div class="qr-info">
								<strong>%s</strong>
								<p>%s</p>
								<p>%s</p>
								<p>%s</p>
							</div>
						</div>
					</div>
					<div class="qr-amount-box">
						<div style="display: grid; grid-template-columns: 12mm auto;">
                            <p style="font-size: 6pt; font-weight: bold; margin: 0;">%s</p>
                            <p style="font-size: 6pt; font-weight: bold; margin: 0;">%s</p>
                            <p style="font-size: 8pt; font-weight: bold; margin: 0;">%s</p>
                            <p style="font-size: 8pt; font-weight: bold; margin: 0;">%.2f</p>
                        </div>
					</div>
				</div>
			</div>
		</div>`,
			tr.ReceiptSection,       // "Empfangsschein" / "Receipt" / etc.
			tr.AccountPayableTo,     // "Konto / Zahlbar an"
			banking.IBAN,
			senderName,
			senderStreet,
			senderLocation,
			tr.PayableBy,            // "Zahlbar durch"
			userName,
			userStreet,
			userLocation,
			tr.Currency,             // "Währung"
			tr.AmountLabel,          // "Betrag"
			currency,
			totalAmount,
			tr.AcceptancePoint,      // "Annahmestelle"
			tr.PaymentPart,          // "Zahlteil"
			qrCodeContent,
			tr.AccountPayableTo,     // "Konto / Zahlbar an"
			banking.IBAN,
			senderName,
			senderStreet,
			senderLocation,
			tr.AdditionalInfo,       // "Zusätzliche Informationen"
			tr.InvoiceLabel,         // "Invoice" / "Rechnung" / etc.
			invoiceNumber,
			tr.PayableBy,            // "Zahlbar durch"
			userName,
			userStreet,
			userLocation,
			tr.Currency,             // "Währung"
			tr.AmountLabel,          // "Betrag"
			currency,
			totalAmount,
		)
	}

	// Build complete HTML
	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
	<title>Invoice %s</title>
	<meta charset="UTF-8">
	<style>
		@page {
			size: A4;
			margin: 15mm;
		}
		
		body { 
			font-family: Arial, sans-serif; 
			padding: 0;
			margin: 0;
			max-width: 210mm;
			font-size: 10pt;
		}
		
		.page {
			padding: 20px;
			position: relative;
			box-sizing: border-box;
		}
		
		.qr-page {
			page-break-before: always;
			padding: 0;
			margin: 0;
		}
		
		.header { 
			border-bottom: 2px solid #667EEA; 
			padding-bottom: 15px; 
			margin-bottom: 20px;
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
		}
		
		.header-left h1 { 
			margin: 0; 
			font-size: 24pt; 
			color: #667EEA;
		}
		
		.header-left .invoice-number { 
			color: #666; 
			font-size: 10pt; 
			margin-top: 4px;
		}
		
		.header-right {
			text-align: right;
			font-size: 9pt;
			line-height: 1.4;
		}
		
		.header-right strong {
			display: block;
			font-size: 10pt;
			margin-bottom: 3px;
		}
		
		.status-badge {
			display: inline-block;
			padding: 4px 12px;
			border-radius: 15px;
			font-size: 9pt;
			font-weight: 600;
			margin-top: 8px;
			background-color: %s;
			color: %s;
		}
		
		.archived-banner {
			background-color: #f8d7da;
			color: #721c24;
			padding: 10px;
			text-align: center;
			font-weight: bold;
			border-radius: 6px;
			margin-bottom: 15px;
			border: 2px solid #f5c6cb;
			font-size: 10pt;
		}
		
		.addresses {
			display: flex;
			justify-content: space-between;
			margin-bottom: 20px;
		}
		
		.info-section { 
			flex: 1;
		}
		
		.info-section h3 { 
			font-size: 10pt; 
			text-transform: uppercase; 
			color: #666; 
			margin-bottom: 8px;
			font-weight: 600;
		}
		
		.info-section p { 
			margin: 3px 0; 
			line-height: 1.4;
			font-size: 9pt;
		}
		
		table { 
			width: 100%%; 
			border-collapse: collapse; 
			margin: 20px 0;
			font-size: 9pt;
		}
		
		th { 
			background-color: #f9f9f9; 
			padding: 8px; 
			text-align: left; 
			border-bottom: 2px solid #ddd;
			font-weight: 600;
			font-size: 9pt;
		}
		
		td { 
			padding: 8px; 
			border-bottom: 1px solid #eee;
			font-size: 9pt;
		}
		
		.text-right { 
			text-align: right;
		}
		
		.item-header { 
			font-weight: 600;
			background-color: #f9f9f9;
			border-bottom: 2px solid #ddd;
		}
		
		.item-info { 
			color: #666;
			font-size: 8pt;
			background-color: white;
			border-bottom: none;
		}
		
		.item-info-compact { 
			color: #666;
			font-size: 8pt;
			background-color: white;
			padding: 4px 8px;
		}
		
		.item-cost { 
			font-weight: 500;
		}
		
		.solar-highlight {
			background-color: rgba(254, 243, 199, 0.4);
		}
		
		.normal-highlight {
			background-color: rgba(219, 234, 254, 0.4);
		}
		
		.charging-highlight {
			background-color: rgba(209, 250, 229, 0.4);
		}
		
		.section-separator {
			height: 12px;
			background-color: transparent;
			border: none;
		}
		
		.total-section { 
			background-color: #f9f9f9; 
			padding: 15px; 
			text-align: right; 
			margin-top: 20px;
			border-radius: 6px;
			margin-bottom: 20px;
		}
		
		.total-section p { 
			font-size: 18pt; 
			font-weight: bold; 
			margin: 0;
		}
		
		.payment-details-bottom {
			padding: 15px 0;
			margin-top: 30px;
			border-top: 2px solid #ddd;
			font-size: 8pt;
			color: #666;
		}
		
		.payment-details-bottom h4 {
			font-size: 9pt;
			font-weight: 600;
			margin: 0 0 8px 0;
			color: #333;
		}
		
		.payment-details-bottom p {
			margin: 2px 0;
			line-height: 1.4;
			font-size: 8pt;
		}
		
		.footer-timestamp {
			text-align: right;
			font-size: 7pt;
			color: #999;
			margin-top: 8px;
		}
		
		.qr-page {
			page-break-before: always;
			padding: 0;
			margin: 0;
		}
		
		.qr-container {
			width: 210mm;
			height: 105mm;
			margin: 0;
			padding: 0;
			position: relative;
			overflow: hidden;
		}
		
		.qr-left {
			border-right: 1px dashed #000;
			width: 62mm;
			height: 105mm;
			position: absolute;
			left: 0;
			top: 0;
			padding: 5mm 5mm 15mm 5mm;
			box-sizing: border-box;
			font-size: 6pt;
		}
		
		.qr-right {
			width: 148mm;
			height: 105mm;
			position: absolute;
			left: 62mm;
			top: 0;
			padding: 5mm 5mm 15mm 5mm;
			box-sizing: border-box;
			font-size: 8pt;
		}
		
		.qr-right-layout {
			display: flex;
			gap: 5mm;
			margin-top: 3mm;
		}
		
		.qr-code-column {
			flex-shrink: 0;
			width: 52mm;
		}
		
		.qr-info-column {
			flex: 1;
		}
		
		.qr-section-title {
			font-size: 11pt;
			font-weight: bold;
			margin: 0 0 3mm 0;
		}
		
		.qr-info {
			margin-bottom: 4mm;
		}
		
		.qr-info p {
			margin: 0 0 1mm 0;
			padding: 0;
			line-height: 1.3;
		}
		
		.qr-info strong {
			font-weight: bold;
			display: block;
			margin-bottom: 1mm;
		}
		
		.qr-code-wrapper {
			text-align: left;
			margin: 0;
			width: 46mm;
			height: 46mm;
		}
		
		.qr-code-wrapper img {
			width: 46mm;
			height: 46mm;
			display: block;
		}
		
		.qr-amount-box {
			position: absolute;
			bottom: 25mm;
			left: 5mm;
			right: 5mm;
			padding-top: 2mm;
			border-top: none;
		}
		
		.qr-amount-box p {
			margin: 0.5mm 0;
			line-height: 1.1;
		}
		
		.qr-acceptance-point {
			position: absolute;
			bottom: 20mm;
			right: 5mm;
			font-size: 6pt;
			font-weight: bold;
			text-align: right;
		}
		
		@media print {
			body { 
				padding: 0; 
				font-size: 10pt; 
			}
			
			.page { 
				padding: 15px;
			}
			
			.qr-page {
				page-break-before: always;
				padding: 0;
				margin: 0;
				height: 105mm;
			}
			
			@page { 
				margin: 15mm;
				size: A4 portrait;
			}
			
			.qr-page {
				page: qr-bill;
			}
			
			@page qr-bill {
				margin: 0;
				size: 210mm 105mm;
			}
			
			* {
				-webkit-print-color-adjust: exact !important;
				print-color-adjust: exact !important;
				color-adjust: exact !important;
			}
		}
	</style>
</head>
<body>
	<div class="page">
		%s
		
		<div class="header">
			<div class="header-left">
				<h1>%s</h1>
				<div class="invoice-number">#%s</div>
				<div class="status-badge">%s</div>
			</div>
			%s
		</div>

		<div class="addresses">
			<div class="info-section">
				<h3>%s</h3>
				<p>%s</p>
			</div>

			<div class="info-section">
				<h3>%s</h3>
				<p>
					<strong>%s:</strong> %s to %s<br>
					<strong>%s:</strong> %s<br>
					<strong>%s:</strong> %s
				</p>
			</div>
		</div>

		<table>
			<thead>
				<tr>
					<th>%s</th>
					<th class="text-right">%s</th>
				</tr>
			</thead>
			<tbody>
				%s
			</tbody>
		</table>

		<div class="total-section">
			<p>%s %s %.2f</p>
		</div>

		%s
	</div>

	%s
</body>
</html>`,
		invoiceNumber,
		statusColors.bg, statusColors.color,
		archivedBanner,
		tr.Invoice,
		invoiceNumber,
		strings.ToUpper(status),
		senderSection,
		tr.BillTo,
		userInfo,
		tr.InvoiceDetails,
		tr.Period,
		formatDate(periodStart), formatDate(periodEnd),
		tr.Generated,
		formatDate(generatedAt),
		tr.Status,
		status,
		tr.Description,
		tr.Amount,
		itemsHTML,
		tr.Total,
		currency, totalAmount,
		paymentSection,
		qrPage,
	)

	return html, nil
}

func (pg *PDFGenerator) generateItemHTML(item map[string]interface{}, currency string) string {
	description := fmt.Sprintf("%v", item["description"])
	itemType := fmt.Sprintf("%v", item["item_type"])
	totalPrice := 0.0
	if tp, ok := item["total_price"].(float64); ok {
		totalPrice = tp
	}

	// Icons as inline SVG
	sunIcon := `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-8.93-8.93 1.41 1.41m12.73 0 1.41-1.41M2 12h2m16 0h2m-3.07 6.34-1.41-1.41M6.34 6.34 4.93 4.93"/></svg>`

	boltIcon := `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>`

	carIcon := `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`

	switch itemType {
	case "meter_info":
		return fmt.Sprintf(`<tr class="item-header"><td colspan="2"><strong>%s</strong></td></tr>`, description)

	case "charging_header":
		return fmt.Sprintf(`<tr class="section-separator"><td colspan="2"></td></tr><tr class="item-header"><td colspan="2"><strong>%s</strong></td></tr>`, description)

	case "meter_reading_compact":
		// This should be a SINGLE line with all info: date range, old/new readings, consumption
		return fmt.Sprintf(`<tr class="item-info-compact"><td colspan="2" style="padding: 6px 8px;">%s</td></tr>`, description)

	case "charging_session_compact":
		// Single line with charging session period and total
		return fmt.Sprintf(`<tr class="item-info-compact"><td colspan="2" style="padding: 6px 8px;">%s</td></tr>`, description)

	case "separator":
		return `<tr class="section-separator"><td colspan="2"></td></tr>`

	case "solar_power":
		return fmt.Sprintf(`<tr class="item-cost solar-highlight">
			<td style="padding-left: 20px;">
				<span style="display: inline-flex; align-items: center; gap: 6px;">
					%s
					<strong>%s</strong>
				</span>
			</td>
			<td class="text-right"><strong>%s %.2f</strong></td>
		</tr>`, sunIcon, description, currency, totalPrice)

	case "normal_power":
		return fmt.Sprintf(`<tr class="item-cost normal-highlight">
			<td style="padding-left: 20px;">
				<span style="display: inline-flex; align-items: center; gap: 6px;">
					%s
					<strong>%s</strong>
				</span>
			</td>
			<td class="text-right"><strong>%s %.2f</strong></td>
		</tr>`, boltIcon, description, currency, totalPrice)

	case "car_charging_normal", "car_charging_priority":
		return fmt.Sprintf(`<tr class="item-cost charging-highlight">
			<td style="padding-left: 20px;">
				<span style="display: inline-flex; align-items: center; gap: 6px;">
					%s
					<strong>%s</strong>
				</span>
			</td>
			<td class="text-right"><strong>%s %.2f</strong></td>
		</tr>`, carIcon, description, currency, totalPrice)

	case "custom_item_header":
		return fmt.Sprintf(`<tr class="section-separator"><td colspan="2"></td></tr><tr class="item-header"><td colspan="2"><strong>%s</strong></td></tr>`, description)

	case "custom_item":
		// Custom items with price
		return fmt.Sprintf(`<tr class="item-cost">
			<td style="padding-left: 8px;"><strong>%s</strong></td>
			<td class="text-right"><strong>%s %.2f</strong></td>
		</tr>`, description, currency, totalPrice)

	default:
		if totalPrice > 0 {
			return fmt.Sprintf(`<tr class="item-cost">
				<td><strong>%s</strong></td>
				<td class="text-right"><strong>%s %.2f</strong></td>
			</tr>`, description, currency, totalPrice)
		}
		return fmt.Sprintf(`<tr class="item-info-compact"><td colspan="2">%s</td></tr>`, description)
	}
}

type statusColor struct {
	bg    string
	color string
}

func getStatusColors(status string) statusColor {
	switch strings.ToLower(status) {
	case "issued":
		return statusColor{bg: "#d4edda", color: "#155724"}
	case "pending":
		return statusColor{bg: "#fff3cd", color: "#856404"}
	case "paid":
		return statusColor{bg: "#d1ecf1", color: "#0c5460"}
	case "draft":
		return statusColor{bg: "#f8d7da", color: "#721c24"}
	case "archived":
		return statusColor{bg: "#e2e3e5", color: "#383d41"}
	default:
		return statusColor{bg: "#e2e3e5", color: "#383d41"}
	}
}

// Helper: Group IBAN every 4 characters for display
func formatIBAN(iban string) string {
	// Remove all spaces first
	cleaned := strings.ReplaceAll(strings.TrimSpace(iban), " ", "")
	var result strings.Builder
	for i, r := range cleaned {
		if i > 0 && i%4 == 0 {
			result.WriteString(" ")
		}
		result.WriteRune(r)
	}
	return result.String()
}

// Helper: Hide country line for domestic (CH) addresses
func shouldShowCountry(country string) bool {
	c := strings.ToUpper(strings.TrimSpace(country))
	return c != "CH" && c != "SWITZERLAND"
}

func formatDate(dateStr string) string {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		t, err = time.Parse(time.RFC3339, dateStr)
		if err != nil {
			return dateStr
		}
	}
	return t.Format("02.01.2006")
}

func (pg *PDFGenerator) generateSwissQRData(inv map[string]interface{}, sender SenderInfo, banking BankingInfo) string {
	// Validate IBAN
	iban := strings.ReplaceAll(banking.IBAN, " ", "")
	iban = strings.ToUpper(iban)

	if !regexp.MustCompile(`^(CH|LI)[0-9]{2}[A-Z0-9]{1,21}$`).MatchString(iban) {
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
	userZip := ""
	userCity := ""
	userCountry := "CH"
	userName := ""

	if user, ok := inv["user"].(map[string]interface{}); ok {
		firstName := fmt.Sprintf("%v", user["first_name"])
		lastName := fmt.Sprintf("%v", user["last_name"])
		userName = fmt.Sprintf("%s %s", firstName, lastName)

		if addr, ok := user["address_street"].(string); ok {
			userStreet, userHouseNo = parseAddress(addr)
		}
		if zip, ok := user["address_zip"].(string); ok {
			userZip = zip
		}
		if city, ok := user["address_city"].(string); ok {
			userCity = city
		}
		if country, ok := user["address_country"].(string); ok {
			userCountry = country
		}
	}

	// Build QR data (31 lines)
	qrParts := []string{
		"SPC",                                   // 1: QR Type
		"0200",                                  // 2: Version
		"1",                                     // 3: Coding
		iban,                                    // 4: IBAN
		"S",                                     // 5: Creditor Address Type
		truncate(banking.AccountHolder, 70),     // 6: Creditor Name
		truncate(senderStreet, 70),              // 7: Creditor Street
		truncate(senderHouseNo, 16),             // 8: Creditor House No
		truncate(sender.Zip, 16),                // 9: Creditor Postal Code
		truncate(sender.City, 35),               // 10: Creditor City
		truncate(sender.Country, 2),             // 11: Creditor Country
		"",                                      // 12: Ultimate Creditor Address Type
		"",                                      // 13: Ultimate Creditor Name
		"",                                      // 14: Ultimate Creditor Street
		"",                                      // 15: Ultimate Creditor House No
		"",                                      // 16: Ultimate Creditor Postal Code
		"",                                      // 17: Ultimate Creditor City
		"",                                      // 18: Ultimate Creditor Country
		fmt.Sprintf("%.2f", totalAmount),        // 19: Amount
		truncate(currency, 3),                   // 20: Currency
		"S",                                     // 21: Debtor Address Type
		truncate(userName, 70),                  // 22: Debtor Name
		truncate(userStreet, 70),                // 23: Debtor Street
		truncate(userHouseNo, 16),               // 24: Debtor House No
		truncate(userZip, 16),                   // 25: Debtor Postal Code
		truncate(userCity, 35),                  // 26: Debtor City
		truncate(userCountry, 2),                // 27: Debtor Country
		"NON",                                   // 28: Reference Type
		"",                                      // 29: Reference
		truncate("Invoice "+invoiceNumber, 140), // 30: Additional Information
		"EPD",                                   // 31: End Payment Data
	}

	qrData := strings.Join(qrParts, "\r\n")

	lines := strings.Split(qrData, "\r\n")
	if len(lines) != 31 {
		log.Printf("Invalid QR data structure: expected 31 lines, got %d", len(lines))
		return ""
	}

	log.Println("Ã¢Å“â€¦ Generated valid Swiss QR data with 31 elements")
	return qrData
}

func parseAddress(address string) (street, houseNo string) {
	if address == "" {
		return "", ""
	}

	// Try to split address into street and house number
	parts := strings.Fields(address)
	if len(parts) == 0 {
		return "", ""
	}

	// Check if last part looks like a house number
	lastPart := parts[len(parts)-1]
	if len(lastPart) > 0 && (lastPart[0] >= '0' && lastPart[0] <= '9') {
		return strings.Join(parts[:len(parts)-1], " "), lastPart
	}

	return address, ""
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen]
}