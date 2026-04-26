package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"diaryapp/backend/internal/config"
	"diaryapp/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newTestRouter(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Entry{}, &models.Attachment{}); err != nil {
		t.Fatal(err)
	}
	return NewRouter(db, config.Config{JWTSecret: "test-secret", TokenTTL: 7 * 24 * time.Hour})
}

func postJSON(t *testing.T, router http.Handler, path string, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	payload, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	return res
}

func requestJSON(t *testing.T, router http.Handler, method string, path string, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		payload, _ := json.Marshal(body)
		reader = bytes.NewReader(payload)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)
	return res
}

func TestRegisterLoginAndCreateEncryptedEntry(t *testing.T) {
	router := newTestRouter(t)

	res := postJSON(t, router, "/api/auth/register", "", map[string]string{
		"email": "me@example.com", "password": "secret123",
	})
	if res.Code != http.StatusCreated {
		t.Fatalf("register status = %d body=%s", res.Code, res.Body.String())
	}
	var register struct {
		Data struct {
			User struct {
				Email   string `json:"email"`
				KDFSalt string `json:"kdfSalt"`
			} `json:"user"`
		} `json:"data"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &register); err != nil {
		t.Fatal(err)
	}
	if register.Data.User.Email != "me@example.com" || register.Data.User.KDFSalt == "" {
		t.Fatalf("register response missing user envelope: %s", res.Body.String())
	}

	res = postJSON(t, router, "/api/auth/login", "", map[string]string{
		"email": "me@example.com", "password": "secret123",
	})
	if res.Code != http.StatusOK {
		t.Fatalf("login status = %d body=%s", res.Code, res.Body.String())
	}
	var login struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &login); err != nil {
		t.Fatal(err)
	}
	if login.Data.Token == "" {
		t.Fatal("expected token")
	}

	res = postJSON(t, router, "/api/entries", login.Data.Token, map[string]any{
		"entryDate":        "2026-04-25",
		"encryptedPayload": "ciphertext-only",
		"nonce":            "nonce-value",
	})
	if res.Code != http.StatusCreated {
		t.Fatalf("create entry status = %d body=%s", res.Code, res.Body.String())
	}
	if bytes.Contains(res.Body.Bytes(), []byte("secret123")) {
		t.Fatal("response leaked password")
	}
}

func TestEntryAccessIsScopedToCurrentUser(t *testing.T) {
	router := newTestRouter(t)
	first := registerAndLogin(t, router, "a@example.com")
	second := registerAndLogin(t, router, "b@example.com")

	res := postJSON(t, router, "/api/entries", first, map[string]any{
		"entryDate": "2026-04-25", "encryptedPayload": "first-user-data", "nonce": "n1",
	})
	if res.Code != http.StatusCreated {
		t.Fatalf("create entry status = %d", res.Code)
	}
	var created struct {
		Data models.Entry `json:"data"`
	}
	_ = json.Unmarshal(res.Body.Bytes(), &created)

	req := httptest.NewRequest(http.MethodGet, "/api/entries/"+strconv.Itoa(int(created.Data.ID)), nil)
	req.Header.Set("Authorization", "Bearer "+second)
	out := httptest.NewRecorder()
	router.ServeHTTP(out, req)
	if out.Code != http.StatusNotFound {
		t.Fatalf("cross-user get status = %d body=%s", out.Code, out.Body.String())
	}
}

func TestUserCanOnlyHaveOneActiveEntryPerDate(t *testing.T) {
	router := newTestRouter(t)
	token := registerAndLogin(t, router, "one-per-day@example.com")

	body := map[string]any{
		"entryDate": "2026-04-26", "encryptedPayload": "ciphertext", "nonce": "nonce",
	}
	first := postJSON(t, router, "/api/entries", token, body)
	if first.Code != http.StatusCreated {
		t.Fatalf("first create status = %d body=%s", first.Code, first.Body.String())
	}
	second := postJSON(t, router, "/api/entries", token, body)
	if second.Code != http.StatusConflict {
		t.Fatalf("duplicate create status = %d body=%s", second.Code, second.Body.String())
	}
}

func TestEntryDateMustBeISODate(t *testing.T) {
	router := newTestRouter(t)
	token := registerAndLogin(t, router, "date@example.com")

	for _, entryDate := range []string{"2026-4-26", "2026-02-30", "not-a-date", ""} {
		res := postJSON(t, router, "/api/entries", token, map[string]any{
			"entryDate": entryDate, "encryptedPayload": "ciphertext", "nonce": "nonce",
		})
		if res.Code != http.StatusBadRequest {
			t.Fatalf("entryDate %q status = %d body=%s", entryDate, res.Code, res.Body.String())
		}
	}

	created := postJSON(t, router, "/api/entries", token, map[string]any{
		"entryDate": "2026-04-26", "encryptedPayload": "ciphertext", "nonce": "nonce",
	})
	var body struct {
		Data models.Entry `json:"data"`
	}
	_ = json.Unmarshal(created.Body.Bytes(), &body)
	updated := requestJSON(t, router, http.MethodPut, "/api/entries/"+strconv.Itoa(int(body.Data.ID)), token, map[string]any{
		"entryDate": "2026-13-01", "encryptedPayload": "ciphertext", "nonce": "nonce", "version": body.Data.Version,
	})
	if updated.Code != http.StatusBadRequest {
		t.Fatalf("invalid update date status = %d body=%s", updated.Code, updated.Body.String())
	}
}

func TestRejectsUnexpectedJWTSigningMethod(t *testing.T) {
	router := newTestRouter(t)
	token := jwt.NewWithClaims(jwt.SigningMethodHS512, jwt.MapClaims{"sub": "1", "exp": time.Now().Add(time.Hour).Unix()})
	signed, err := token.SignedString([]byte("test-secret"))
	if err != nil {
		t.Fatal(err)
	}

	res := requestJSON(t, router, http.MethodGet, "/api/me", signed, nil)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body=%s", res.Code, res.Body.String())
	}
}

func TestDeletedEntryCanBeRestoredOrPermanentlyDeleted(t *testing.T) {
	router := newTestRouter(t)
	token := registerAndLogin(t, router, "trash@example.com")
	res := postJSON(t, router, "/api/entries", token, map[string]any{
		"entryDate": "2026-04-26", "encryptedPayload": "ciphertext", "nonce": "nonce",
	})
	var created struct {
		Data models.Entry `json:"data"`
	}
	_ = json.Unmarshal(res.Body.Bytes(), &created)

	deleted := requestJSON(t, router, http.MethodDelete, "/api/entries/"+strconv.Itoa(int(created.Data.ID)), token, nil)
	if deleted.Code != http.StatusOK {
		t.Fatalf("delete status = %d body=%s", deleted.Code, deleted.Body.String())
	}

	trash := requestJSON(t, router, http.MethodGet, "/api/trash", token, nil)
	if trash.Code != http.StatusOK || !bytes.Contains(trash.Body.Bytes(), []byte("2026-04-26")) {
		t.Fatalf("trash status = %d body=%s", trash.Code, trash.Body.String())
	}

	restored := postJSON(t, router, "/api/entries/"+strconv.Itoa(int(created.Data.ID))+"/restore", token, nil)
	if restored.Code != http.StatusOK {
		t.Fatalf("restore status = %d body=%s", restored.Code, restored.Body.String())
	}

	_ = requestJSON(t, router, http.MethodDelete, "/api/entries/"+strconv.Itoa(int(created.Data.ID)), token, nil)
	permanent := requestJSON(t, router, http.MethodDelete, "/api/trash/"+strconv.Itoa(int(created.Data.ID)), token, nil)
	if permanent.Code != http.StatusOK {
		t.Fatalf("permanent delete status = %d body=%s", permanent.Code, permanent.Body.String())
	}
	missing := requestJSON(t, router, http.MethodGet, "/api/trash", token, nil)
	if bytes.Contains(missing.Body.Bytes(), []byte("2026-04-26")) {
		t.Fatalf("permanently deleted entry still in trash: %s", missing.Body.String())
	}
}

func registerAndLogin(t *testing.T, router http.Handler, email string) string {
	t.Helper()
	_ = postJSON(t, router, "/api/auth/register", "", map[string]string{"email": email, "password": "secret123"})
	res := postJSON(t, router, "/api/auth/login", "", map[string]string{"email": email, "password": "secret123"})
	var login struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	_ = json.Unmarshal(res.Body.Bytes(), &login)
	return login.Data.Token
}
