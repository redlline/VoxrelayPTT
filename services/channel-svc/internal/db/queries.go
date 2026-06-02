package db

import (
	"context"

	"github.com/redlline/VoxrelayPTT/services/channel-svc/internal/model"
)

func (d *DB) ListChannels(ctx context.Context, userID string) ([]model.ChannelWithMeta, error) {
	rows, err := d.Pool.Query(ctx,
		`SELECT c.id, c.name, c.description, c.type, c.owner_id, c.is_active,
		        c.max_bitrate, c.created_at, c.updated_at,
		        cm.role as member_role,
		        (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count
		 FROM channels c
		 LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $1
		 WHERE c.is_active = true
		   AND (c.type = 'public' OR cm.user_id IS NOT NULL)
		 ORDER BY c.name`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []model.ChannelWithMeta
	for rows.Next() {
		var ch model.ChannelWithMeta
		err := rows.Scan(&ch.ID, &ch.Name, &ch.Description, &ch.Type, &ch.OwnerID,
			&ch.IsActive, &ch.MaxBitrate, &ch.CreatedAt, &ch.UpdatedAt,
			&ch.MemberRole, &ch.MemberCount)
		if err != nil {
			return nil, err
		}
		channels = append(channels, ch)
	}
	return channels, nil
}

func (d *DB) GetChannel(ctx context.Context, id string) (*model.Channel, error) {
	var ch model.Channel
	err := d.Pool.QueryRow(ctx,
		`SELECT id, name, description, type, owner_id, is_active, max_bitrate, created_at, updated_at
		 FROM channels WHERE id = $1 AND is_active = true`,
		id,
	).Scan(&ch.ID, &ch.Name, &ch.Description, &ch.Type, &ch.OwnerID,
		&ch.IsActive, &ch.MaxBitrate, &ch.CreatedAt, &ch.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &ch, nil
}

func (d *DB) GetChannelMembers(ctx context.Context, channelID string) ([]model.ChannelMember, error) {
	rows, err := d.Pool.Query(ctx,
		`SELECT cm.id, cm.channel_id, cm.user_id, cm.role, cm.is_muted, cm.joined_at,
		        u.display_name, u.avatar_url, u.role, u.last_seen_at
		 FROM channel_members cm
		 JOIN users u ON u.id = cm.user_id
		 WHERE cm.channel_id = $1
		 ORDER BY cm.joined_at`,
		channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []model.ChannelMember
	for rows.Next() {
		var m model.ChannelMember
		err := rows.Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Role, &m.IsMuted, &m.JoinedAt,
			&m.DisplayName, &m.AvatarURL, &m.UserRole, &m.LastSeenAt)
		if err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, nil
}

func (d *DB) GetChannelMember(ctx context.Context, channelID, userID string) (*model.ChannelMember, error) {
	var m model.ChannelMember
	err := d.Pool.QueryRow(ctx,
		`SELECT cm.id, cm.channel_id, cm.user_id, cm.role, cm.is_muted, cm.joined_at
		 FROM channel_members cm
		 WHERE cm.channel_id = $1 AND cm.user_id = $2`,
		channelID, userID,
	).Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Role, &m.IsMuted, &m.JoinedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (d *DB) CreateChannel(ctx context.Context, userID string, req *model.CreateChannelRequest) (*model.Channel, error) {
	tx, err := d.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var ch model.Channel
	err = tx.QueryRow(ctx,
		`INSERT INTO channels (name, description, type, owner_id)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, name, description, type, owner_id, is_active, max_bitrate, created_at, updated_at`,
		req.Name, req.Description, req.Type, userID,
	).Scan(&ch.ID, &ch.Name, &ch.Description, &ch.Type, &ch.OwnerID,
		&ch.IsActive, &ch.MaxBitrate, &ch.CreatedAt, &ch.UpdatedAt)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO channel_members (channel_id, user_id, role)
		 VALUES ($1, $2, 'owner')`,
		ch.ID, userID,
	)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &ch, nil
}

func (d *DB) UpdateChannel(ctx context.Context, id string, req *model.UpdateChannelRequest) (*model.Channel, error) {
	var ch model.Channel
	err := d.Pool.QueryRow(ctx,
		`UPDATE channels SET
			name = COALESCE($2, name),
			description = COALESCE($3, description),
			type = COALESCE($4, type),
			updated_at = NOW()
		 WHERE id = $1 AND is_active = true
		 RETURNING id, name, description, type, owner_id, is_active, max_bitrate, created_at, updated_at`,
		id, req.Name, req.Description, req.Type,
	).Scan(&ch.ID, &ch.Name, &ch.Description, &ch.Type, &ch.OwnerID,
		&ch.IsActive, &ch.MaxBitrate, &ch.CreatedAt, &ch.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &ch, nil
}

func (d *DB) DeleteChannel(ctx context.Context, id string) error {
	_, err := d.Pool.Exec(ctx,
		`UPDATE channels SET is_active = false, updated_at = NOW() WHERE id = $1`, id)
	return err
}

func (d *DB) JoinChannel(ctx context.Context, channelID, userID string) error {
	_, err := d.Pool.Exec(ctx,
		`INSERT INTO channel_members (channel_id, user_id)
		 VALUES ($1, $2)
		 ON CONFLICT (channel_id, user_id) DO NOTHING`,
		channelID, userID)
	return err
}

func (d *DB) LeaveChannel(ctx context.Context, channelID, userID string) error {
	_, err := d.Pool.Exec(ctx,
		`DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2`,
		channelID, userID)
	return err
}

func (d *DB) AddMember(ctx context.Context, channelID, userID, role string) (*model.ChannelMember, error) {
	var m model.ChannelMember
	err := d.Pool.QueryRow(ctx,
		`INSERT INTO channel_members (channel_id, user_id, role)
		 VALUES ($1, $2, $3)
		 RETURNING id, channel_id, user_id, role, joined_at`,
		channelID, userID, role,
	).Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Role, &m.JoinedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (d *DB) RemoveMember(ctx context.Context, channelID, userID string) error {
	_, err := d.Pool.Exec(ctx,
		`DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2`,
		channelID, userID)
	return err
}

func (d *DB) MuteMember(ctx context.Context, channelID, userID string, muted bool) error {
	_, err := d.Pool.Exec(ctx,
		`UPDATE channel_members SET is_muted = $3
		 WHERE channel_id = $1 AND user_id = $2`,
		channelID, userID, muted)
	return err
}

func (d *DB) CreateSOSAlert(ctx context.Context, channelID, userID, message string) (*model.SOSAlert, error) {
	var a model.SOSAlert
	err := d.Pool.QueryRow(ctx,
		`INSERT INTO sos_alerts (channel_id, user_id, message)
		 VALUES ($1, $2, $3)
		 RETURNING id, channel_id, user_id, message, created_at`,
		channelID, userID, message,
	).Scan(&a.ID, &a.ChannelID, &a.UserID, &a.Message, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (d *DB) ResolveSOSAlert(ctx context.Context, sosID, channelID, resolvedBy string) error {
	_, err := d.Pool.Exec(ctx,
		`UPDATE sos_alerts SET resolved_at = NOW(), resolved_by = $3
		 WHERE id = $1 AND channel_id = $2 AND resolved_at IS NULL`,
		sosID, channelID, resolvedBy)
	return err
}

func (d *DB) ListSOSAlerts(ctx context.Context, channelID string) ([]model.SOSAlert, error) {
	rows, err := d.Pool.Query(ctx,
		`SELECT sa.id, sa.channel_id, sa.user_id, sa.message,
		        sa.resolved_at, sa.resolved_by, sa.created_at, u.display_name
		 FROM sos_alerts sa
		 JOIN users u ON u.id = sa.user_id
		 WHERE sa.channel_id = $1
		 ORDER BY sa.created_at DESC
		 LIMIT 50`,
		channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var alerts []model.SOSAlert
	for rows.Next() {
		var a model.SOSAlert
		err := rows.Scan(&a.ID, &a.ChannelID, &a.UserID, &a.Message,
			&a.ResolvedAt, &a.ResolvedBy, &a.CreatedAt, &a.DisplayName)
		if err != nil {
			return nil, err
		}
		alerts = append(alerts, a)
	}
	return alerts, nil
}

func (d *DB) GetChannelLocations(ctx context.Context, channelID string) ([]model.UserLocation, error) {
	rows, err := d.Pool.Query(ctx,
		`SELECT ul.user_id, ul.latitude, ul.longitude, ul.accuracy, ul.updated_at, u.display_name
		 FROM user_locations ul
		 JOIN users u ON u.id = ul.user_id
		 WHERE ul.channel_id = $1
		   AND ul.updated_at > NOW() - INTERVAL '5 minutes'
		 ORDER BY ul.updated_at DESC`,
		channelID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var locations []model.UserLocation
	for rows.Next() {
		var loc model.UserLocation
		err := rows.Scan(&loc.UserID, &loc.Latitude, &loc.Longitude, &loc.Accuracy, &loc.UpdatedAt, &loc.DisplayName)
		if err != nil {
			return nil, err
		}
		locations = append(locations, loc)
	}
	return locations, nil
}

func (d *DB) GetUserByID(ctx context.Context, id string) (*struct {
	ID          string
	DisplayName string
	Email       string
	IsActive    bool
}, error) {
	var u struct {
		ID          string
		DisplayName string
		Email       string
		IsActive    bool
	}
	err := d.Pool.QueryRow(ctx,
		`SELECT id, display_name, email, is_active FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.DisplayName, &u.Email, &u.IsActive)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (d *DB) PublishEvent(ctx context.Context, channel, message string) error {
	return d.Redis.Publish(ctx, channel, message).Err()
}
