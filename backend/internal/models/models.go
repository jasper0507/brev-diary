package models

import "time"

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Email        string    `gorm:"uniqueIndex;size:255;not null" json:"email"`
	PasswordHash string    `gorm:"size:255;not null" json:"-"`
	KDFSalt      string    `gorm:"size:64;not null" json:"kdfSalt"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Entry struct {
	ID               uint       `gorm:"primaryKey" json:"id"`
	UserID           uint       `gorm:"index;not null" json:"-"`
	EntryDate        string     `gorm:"size:10;index;not null" json:"entryDate"`
	EncryptedPayload string     `gorm:"type:longtext;not null" json:"encryptedPayload"`
	Nonce            string     `gorm:"size:64;not null" json:"nonce"`
	Version          uint       `gorm:"not null;default:1" json:"version"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
	DeletedAt        *time.Time `gorm:"index" json:"deletedAt,omitempty"`
}

type Attachment struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	UserID            uint      `gorm:"index;not null" json:"-"`
	EntryID           uint      `gorm:"index;not null" json:"entryId"`
	ObjectKey         string    `gorm:"size:255;not null" json:"objectKey"`
	EncryptedMetadata string    `gorm:"type:text;not null" json:"encryptedMetadata"`
	ByteSize          int64     `gorm:"not null" json:"byteSize"`
	CreatedAt         time.Time `json:"createdAt"`
}
