package app

import (
	"errors"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"diaryapp/backend/internal/config"
	"diaryapp/backend/internal/crypto"
	"diaryapp/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type server struct {
	db  *gorm.DB
	cfg config.Config
}

func NewRouter(db *gorm.DB, cfg config.Config) *gin.Engine {
	s := &server{db: db, cfg: cfg}
	r := gin.Default()
	api := r.Group("/api")
	api.POST("/auth/register", s.register)
	api.POST("/auth/login", s.login)
	api.POST("/auth/forgot-password", s.forgotPassword)

	auth := api.Group("")
	auth.Use(s.authRequired())
	auth.GET("/me", s.me)
	auth.GET("/entries", s.listEntries)
	auth.POST("/entries", s.createEntry)
	auth.GET("/entries/:id", s.getEntry)
	auth.PUT("/entries/:id", s.updateEntry)
	auth.DELETE("/entries/:id", s.deleteEntry)
	auth.GET("/trash", s.listTrash)
	auth.POST("/entries/:id/restore", s.restoreEntry)
	auth.DELETE("/trash/:id", s.permanentDeleteEntry)
	auth.POST("/attachments", s.createAttachment)
	auth.GET("/attachments/:id", s.getAttachment)
	return r
}

type authRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *server) register(c *gin.Context) {
	var req authRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		errorJSON(c, http.StatusBadRequest, "invalid_json")
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if !validEmail(email) || len(req.Password) < 6 {
		errorJSON(c, http.StatusBadRequest, "invalid_credentials")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		errorJSON(c, http.StatusInternalServerError, "hash_failed")
		return
	}
	diaryKey, err := crypto.RandomDiaryKey()
	if err != nil {
		errorJSON(c, http.StatusInternalServerError, "diary_key_failed")
		return
	}
	user := models.User{Email: email, PasswordHash: string(hash), DiaryKey: diaryKey}
	if err := s.db.Create(&user).Error; err != nil {
		errorJSON(c, http.StatusConflict, "email_exists")
		return
	}
	token, err := s.issueToken(user.ID)
	if err != nil {
		errorJSON(c, http.StatusInternalServerError, "token_failed")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": gin.H{"token": token, "user": gin.H{"id": user.ID, "email": user.Email, "diaryKey": user.DiaryKey}}, "error": nil})
}

func (s *server) login(c *gin.Context) {
	var req authRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		errorJSON(c, http.StatusBadRequest, "invalid_json")
		return
	}
	var user models.User
	if err := s.db.Where("email = ?", strings.TrimSpace(strings.ToLower(req.Email))).First(&user).Error; err != nil {
		errorJSON(c, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		errorJSON(c, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	token, err := s.issueToken(user.ID)
	if err != nil {
		errorJSON(c, http.StatusInternalServerError, "token_failed")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"token": token, "user": gin.H{"id": user.ID, "email": user.Email, "diaryKey": user.DiaryKey}}, "error": nil})
}

func (s *server) forgotPassword(c *gin.Context) {
	var req authRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		errorJSON(c, http.StatusBadRequest, "invalid_json")
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if !validEmail(email) || len(req.Password) < 6 {
		errorJSON(c, http.StatusBadRequest, "invalid_credentials")
		return
	}
	var user models.User
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		errorJSON(c, http.StatusNotFound, "email_not_found")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		errorJSON(c, http.StatusInternalServerError, "hash_failed")
		return
	}
	user.PasswordHash = string(hash)
	if err := s.db.Save(&user).Error; err != nil {
		errorJSON(c, http.StatusInternalServerError, "update_failed")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"id": user.ID, "email": user.Email, "diaryKey": user.DiaryKey}, "error": nil})
}

func (s *server) me(c *gin.Context) {
	user := currentUser(c)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"id": user.ID, "email": user.Email, "diaryKey": user.DiaryKey}, "error": nil})
}

type entryRequest struct {
	EntryDate        string `json:"entryDate"`
	EncryptedPayload string `json:"encryptedPayload"`
	Nonce            string `json:"nonce"`
	Version          uint   `json:"version"`
}

func (s *server) listEntries(c *gin.Context) {
	user := currentUser(c)
	var entries []models.Entry
	s.db.Where("user_id = ? AND deleted_at IS NULL", user.ID).Order("entry_date desc").Find(&entries)
	c.JSON(http.StatusOK, gin.H{"data": entries, "error": nil})
}

func (s *server) createEntry(c *gin.Context) {
	user := currentUser(c)
	var req entryRequest
	if err := c.ShouldBindJSON(&req); err != nil || !validEntryDate(req.EntryDate) || req.EncryptedPayload == "" || req.Nonce == "" {
		errorJSON(c, http.StatusBadRequest, "invalid_entry")
		return
	}
	var existing models.Entry
	if err := s.db.Where("user_id = ? AND entry_date = ? AND deleted_at IS NULL", user.ID, req.EntryDate).First(&existing).Error; err == nil {
		errorJSON(c, http.StatusConflict, "entry_date_exists")
		return
	}
	entry := models.Entry{UserID: user.ID, EntryDate: req.EntryDate, EncryptedPayload: req.EncryptedPayload, Nonce: req.Nonce, Version: 1}
	if err := s.db.Create(&entry).Error; err != nil {
		errorJSON(c, http.StatusInternalServerError, "create_failed")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": entry, "error": nil})
}

func (s *server) getEntry(c *gin.Context) {
	entry, ok := s.findEntry(c)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": entry, "error": nil})
}

func (s *server) listTrash(c *gin.Context) {
	user := currentUser(c)
	var entries []models.Entry
	s.db.Where("user_id = ? AND deleted_at IS NOT NULL", user.ID).Order("deleted_at desc").Find(&entries)
	c.JSON(http.StatusOK, gin.H{"data": entries, "error": nil})
}

func (s *server) restoreEntry(c *gin.Context) {
	entry, ok := s.findDeletedEntry(c)
	if !ok {
		return
	}
	var active models.Entry
	if err := s.db.Where("user_id = ? AND entry_date = ? AND deleted_at IS NULL", entry.UserID, entry.EntryDate).First(&active).Error; err == nil {
		errorJSON(c, http.StatusConflict, "entry_date_exists")
		return
	}
	entry.DeletedAt = nil
	s.db.Save(&entry)
	c.JSON(http.StatusOK, gin.H{"data": entry, "error": nil})
}

func (s *server) permanentDeleteEntry(c *gin.Context) {
	entry, ok := s.findDeletedEntry(c)
	if !ok {
		return
	}
	s.db.Delete(&entry)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"id": entry.ID}, "error": nil})
}

func (s *server) updateEntry(c *gin.Context) {
	entry, ok := s.findEntry(c)
	if !ok {
		return
	}
	var req entryRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.EncryptedPayload == "" || req.Nonce == "" {
		errorJSON(c, http.StatusBadRequest, "invalid_entry")
		return
	}
	if req.Version != 0 && req.Version != entry.Version {
		errorJSON(c, http.StatusConflict, "version_conflict")
		return
	}
	if req.EntryDate != "" && !validEntryDate(req.EntryDate) {
		errorJSON(c, http.StatusBadRequest, "invalid_entry")
		return
	}
	entry.EncryptedPayload = req.EncryptedPayload
	entry.Nonce = req.Nonce
	entry.Version++
	if req.EntryDate != "" {
		entry.EntryDate = req.EntryDate
	}
	s.db.Save(&entry)
	c.JSON(http.StatusOK, gin.H{"data": entry, "error": nil})
}

func (s *server) deleteEntry(c *gin.Context) {
	entry, ok := s.findEntry(c)
	if !ok {
		return
	}
	now := time.Now()
	entry.DeletedAt = &now
	s.db.Save(&entry)
	c.JSON(http.StatusOK, gin.H{"data": entry, "error": nil})
}

type attachmentRequest struct {
	EntryID           uint   `json:"entryId"`
	ObjectKey         string `json:"objectKey"`
	EncryptedMetadata string `json:"encryptedMetadata"`
	ByteSize          int64  `json:"byteSize"`
}

func (s *server) createAttachment(c *gin.Context) {
	user := currentUser(c)
	var req attachmentRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.EntryID == 0 || req.ObjectKey == "" {
		errorJSON(c, http.StatusBadRequest, "invalid_attachment")
		return
	}
	if err := s.db.Where("id = ? AND user_id = ?", req.EntryID, user.ID).First(&models.Entry{}).Error; err != nil {
		errorJSON(c, http.StatusNotFound, "entry_not_found")
		return
	}
	attachment := models.Attachment{
		UserID: user.ID, EntryID: req.EntryID, ObjectKey: req.ObjectKey,
		EncryptedMetadata: req.EncryptedMetadata, ByteSize: req.ByteSize,
	}
	s.db.Create(&attachment)
	c.JSON(http.StatusCreated, gin.H{"data": attachment, "error": nil})
}

func (s *server) getAttachment(c *gin.Context) {
	user := currentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var attachment models.Attachment
	if err := s.db.Where("id = ? AND user_id = ?", id, user.ID).First(&attachment).Error; err != nil {
		errorJSON(c, http.StatusNotFound, "attachment_not_found")
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": attachment, "error": nil})
}

func (s *server) findEntry(c *gin.Context) (models.Entry, bool) {
	user := currentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var entry models.Entry
	err := s.db.Where("id = ? AND user_id = ? AND deleted_at IS NULL", id, user.ID).First(&entry).Error
	if errors.Is(err, gorm.ErrRecordNotFound) || err != nil {
		errorJSON(c, http.StatusNotFound, "entry_not_found")
		return entry, false
	}
	return entry, true
}

func (s *server) findDeletedEntry(c *gin.Context) (models.Entry, bool) {
	user := currentUser(c)
	id, _ := strconv.Atoi(c.Param("id"))
	var entry models.Entry
	err := s.db.Where("id = ? AND user_id = ? AND deleted_at IS NOT NULL", id, user.ID).First(&entry).Error
	if errors.Is(err, gorm.ErrRecordNotFound) || err != nil {
		errorJSON(c, http.StatusNotFound, "entry_not_found")
		return entry, false
	}
	return entry, true
}

func (s *server) issueToken(userID uint) (string, error) {
	claims := jwt.MapClaims{"sub": strconv.Itoa(int(userID)), "exp": time.Now().Add(s.cfg.TokenTTL).Unix()}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.cfg.JWTSecret))
}

func (s *server) authRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		tokenString := strings.TrimPrefix(header, "Bearer ")
		if tokenString == "" || tokenString == header {
			errorJSON(c, http.StatusUnauthorized, "missing_token")
			c.Abort()
			return
		}
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
			return []byte(s.cfg.JWTSecret), nil
		}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
		if err != nil || !token.Valid {
			errorJSON(c, http.StatusUnauthorized, "invalid_token")
			c.Abort()
			return
		}
		claims, _ := token.Claims.(jwt.MapClaims)
		sub, _ := claims["sub"].(string)
		id, _ := strconv.Atoi(sub)
		var user models.User
		if err := s.db.First(&user, id).Error; err != nil {
			errorJSON(c, http.StatusUnauthorized, "invalid_user")
			c.Abort()
			return
		}
		c.Set("user", user)
		c.Next()
	}
}

func validEntryDate(value string) bool {
	if len(value) != len("2006-01-02") {
		return false
	}
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}

func validEmail(value string) bool {
	address, err := mail.ParseAddress(value)
	return err == nil && address.Address == value
}

func currentUser(c *gin.Context) models.User {
	user, _ := c.Get("user")
	return user.(models.User)
}

func errorJSON(c *gin.Context, status int, code string) {
	c.JSON(status, gin.H{"data": nil, "error": gin.H{"code": code}})
}
