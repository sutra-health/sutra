package inference

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"time"

	"github.com/sutra-care/sutra/internal/core"
)

type Client struct {
	OCRURL, STTURL string
	http           *http.Client
}

func New(ocrURL, sttURL string, timeout time.Duration) *Client {
	return &Client{OCRURL: ocrURL, STTURL: sttURL, http: &http.Client{Timeout: timeout}}
}
func (c *Client) Extract(ctx context.Context, filename, mediaType string, data []byte) (result core.OCRResult, err error) {
	if c.OCRURL == "" {
		return result, errors.New("OCR service is not configured")
	}
	err = c.postFile(ctx, c.OCRURL+"/v1/extract", "file", filename, mediaType, data, &result)
	return
}
func (c *Client) Transcribe(ctx context.Context, filename, mediaType string, data []byte) (result core.TranscriptResult, err error) {
	if c.STTURL == "" {
		return result, errors.New("speech service is not configured")
	}
	err = c.postFile(ctx, c.STTURL+"/v1/transcribe", "file", filename, mediaType, data, &result)
	return
}
func (c *Client) postFile(ctx context.Context, url, field, filename, mediaType string, data []byte, out any) error {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, field, filename))
	header.Set("Content-Type", mediaType)
	part, err := writer.CreatePart(header)
	if err != nil {
		return err
	}
	if _, err = part.Write(data); err != nil {
		return err
	}
	if err = writer.Close(); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, &body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(res.Body, 16<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("inference service status %d", res.StatusCode)
	}
	return json.Unmarshal(payload, out)
}
