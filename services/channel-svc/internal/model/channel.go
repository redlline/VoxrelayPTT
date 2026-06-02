package model

import "time"

type Channel struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Type        string    `json:"type"`
	OwnerID     *string   `json:"ownerId,omitempty"`
	IsActive    bool      `json:"isActive"`
	MaxBitrate  int       `json:"maxBitrate"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type ChannelMember struct {
	ID          string    `json:"id"`
	ChannelID   string    `json:"channelId"`
	UserID      string    `json:"userId"`
	Role        string    `json:"role"`
	IsMuted     bool      `json:"isMuted"`
	JoinedAt    time.Time `json:"joinedAt"`
	DisplayName string    `json:"displayName,omitempty"`
	AvatarURL   *string   `json:"avatarUrl,omitempty"`
	UserRole    string    `json:"userRole,omitempty"`
	LastSeenAt  *time.Time `json:"lastSeenAt,omitempty"`
}

type ChannelWithMeta struct {
	Channel
	MemberCount int              `json:"memberCount"`
	MemberRole  *string          `json:"memberRole,omitempty"`
	Members     []ChannelMember  `json:"members,omitempty"`
	IsDirectCall bool            `json:"isDirectCall"`
}

type CreateChannelRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Type        string `json:"type"`
}

type UpdateChannelRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	Type        *string `json:"type,omitempty"`
}

type AddMemberRequest struct {
	UserID string `json:"userId"`
	Role   string `json:"role"`
}

type MuteMemberRequest struct {
	Muted bool `json:"muted"`
}

type SOSAlert struct {
	ID          string     `json:"id"`
	ChannelID   string     `json:"channelId"`
	UserID      string     `json:"userId"`
	Message     string     `json:"message"`
	ResolvedAt  *time.Time `json:"resolvedAt,omitempty"`
	ResolvedBy  *string    `json:"resolvedBy,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	DisplayName string     `json:"displayName,omitempty"`
}

type CreateSOSRequest struct {
	Message string `json:"message"`
}

type UserLocation struct {
	UserID      string    `json:"userId"`
	ChannelID   string    `json:"channelId"`
	Latitude    float64   `json:"latitude"`
	Longitude   float64   `json:"longitude"`
	Accuracy    *float64  `json:"accuracy,omitempty"`
	UpdatedAt   time.Time `json:"updatedAt"`
	DisplayName string    `json:"displayName,omitempty"`
}
