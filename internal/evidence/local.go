package evidence

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/sutra-care/sutra/internal/core"
)

type LocalStore struct{ Root string }

func (s LocalStore) SaveOriginal(ctx context.Context, call core.Context, filename, claimedType string, data []byte) (core.StoredObject, error) {
	if len(data) == 0 {
		return core.StoredObject{}, errors.New("empty upload")
	}
	if len(data) > 25<<20 {
		return core.StoredObject{}, errors.New("upload exceeds 25 MiB")
	}
	mediaType := http.DetectContentType(data)
	if !allowed(mediaType) {
		return core.StoredObject{}, errors.New("unsupported document or audio type")
	}
	sum := sha256.Sum256(data)
	digest := hex.EncodeToString(sum[:])
	ext := strings.ToLower(filepath.Ext(filepath.Base(filename)))
	if len(ext) > 10 {
		ext = ""
	}
	dir := filepath.Join(s.Root, call.TenantID, digest[:2])
	if err := os.MkdirAll(dir, 0700); err != nil {
		return core.StoredObject{}, err
	}
	path := filepath.Join(dir, digest+ext)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err == nil {
		if _, err = file.Write(data); err != nil {
			file.Close()
			return core.StoredObject{}, err
		}
		if err = file.Close(); err != nil {
			return core.StoredObject{}, err
		}
	} else if !os.IsExist(err) {
		return core.StoredObject{}, err
	}
	key, err := filepath.Rel(s.Root, path)
	if err != nil {
		return core.StoredObject{}, err
	}
	return core.StoredObject{Key: key, SHA256: digest, MediaType: mediaType, Size: int64(len(data))}, nil
}
func allowed(mediaType string) bool {
	return strings.HasPrefix(mediaType, "image/") || strings.HasPrefix(mediaType, "audio/") || mediaType == "application/pdf"
}
