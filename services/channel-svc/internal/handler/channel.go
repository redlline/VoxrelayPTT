package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/redlline/VoxrelayPTT/services/channel-svc/internal/db"
	"github.com/redlline/VoxrelayPTT/services/channel-svc/internal/model"
)

type ChannelHandler struct {
	db *db.DB
}

func NewChannelHandler(database *db.DB) *ChannelHandler {
	return &ChannelHandler{db: database}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func getUserID(r *http.Request) string {
	return r.Context().Value("userID").(string)
}

func getUserRole(r *http.Request) string {
	if v := r.Context().Value("role"); v != nil {
		return v.(string)
	}
	return ""
}

func getUserDisplayName(r *http.Request) string {
	if v := r.Context().Value("displayName"); v != nil {
		return v.(string)
	}
	return ""
}

func (h *ChannelHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	channels, err := h.db.ListChannels(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list channels")
		return
	}
	if channels == nil {
		channels = []model.ChannelWithMeta{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"channels": channels})
}

func (h *ChannelHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := getUserID(r)

	ch, err := h.db.GetChannel(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	members, err := h.db.GetChannelMembers(r.Context(), id)
	if err != nil {
		members = []model.ChannelMember{}
	}

	member, _ := h.db.GetChannelMember(r.Context(), id, userID)
	var memberRole *string
	if member != nil {
		memberRole = &member.Role
	}

	var memberList []model.ChannelMember
	if members != nil {
		memberList = members
	} else {
		memberList = []model.ChannelMember{}
	}

	isDirectCall := ch.Description == "Direct call" || ch.Description == "Direct PTT call"

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"channel": map[string]interface{}{
			"id":              ch.ID,
			"name":            ch.Name,
			"description":     ch.Description,
			"type":            ch.Type,
			"ownerId":         ch.OwnerID,
			"isActive":        ch.IsActive,
			"maxBitrate":      ch.MaxBitrate,
			"createdAt":       ch.CreatedAt,
			"updatedAt":       ch.UpdatedAt,
			"members":         memberList,
			"currentUserRole": memberRole,
			"isDirectCall":    isDirectCall,
		},
	})
}

func (h *ChannelHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Type == "" {
		req.Type = "public"
	}

	userID := getUserID(r)
	ch, err := h.db.CreateChannel(r.Context(), userID, &req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create channel")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{"channel": ch})
}

func (h *ChannelHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := getUserID(r)

	var req model.UpdateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	member, err := h.db.GetChannelMember(r.Context(), id, userID)
	if err != nil || member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only channel owner can update")
		return
	}

	ch, err := h.db.UpdateChannel(r.Context(), id, &req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update channel")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"channel": ch})
}

func (h *ChannelHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := getUserID(r)

	member, err := h.db.GetChannelMember(r.Context(), id, userID)
	if err != nil || member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only channel owner can delete")
		return
	}

	if err := h.db.DeleteChannel(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete channel")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *ChannelHandler) Join(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := getUserID(r)

	existing, err := h.db.GetChannelMember(r.Context(), id, userID)
	if err == nil && existing != nil {
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
		return
	}

	if err := h.db.JoinChannel(r.Context(), id, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to join channel")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *ChannelHandler) Leave(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := getUserID(r)

	if err := h.db.LeaveChannel(r.Context(), id, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to leave channel")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *ChannelHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	members, err := h.db.GetChannelMembers(r.Context(), id)
	if err != nil {
		members = []model.ChannelMember{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"members": members})
}

func (h *ChannelHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := getUserID(r)

	var req model.AddMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Role == "" {
		req.Role = "member"
	}

	member, err := h.db.GetChannelMember(r.Context(), id, userID)
	requesterRole := getUserRole(r)
	canManage := requesterRole == "admin" || (member != nil && (member.Role == "owner" || member.Role == "admin"))

	if !canManage {
		writeError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	ch, err := h.db.GetChannel(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}
	if !ch.IsActive {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	targetUser, err := h.db.GetUserByID(r.Context(), req.UserID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if !targetUser.IsActive {
		writeError(w, http.StatusNotFound, "user not found or inactive")
		return
	}

	existing, err := h.db.GetChannelMember(r.Context(), id, req.UserID)
	if err == nil && existing != nil {
		writeError(w, http.StatusConflict, "user is already a channel member")
		return
	}

	newMember, err := h.db.AddMember(r.Context(), id, req.UserID, req.Role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add member")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"member": map[string]interface{}{
			"id":           newMember.ID,
			"channelId":    newMember.ChannelID,
			"userId":       newMember.UserID,
			"role":         newMember.Role,
			"joinedAt":     newMember.JoinedAt,
			"display_name": targetUser.DisplayName,
			"email":        targetUser.Email,
		},
	})
}

func (h *ChannelHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	targetUserID := chi.URLParam(r, "userId")
	requesterID := getUserID(r)

	member, err := h.db.GetChannelMember(r.Context(), id, requesterID)
	if err != nil || (member.Role != "owner" && member.Role != "admin") {
		writeError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	targetMember, err := h.db.GetChannelMember(r.Context(), id, targetUserID)
	if err != nil {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	if targetMember.Role == "owner" {
		writeError(w, http.StatusForbidden, "cannot remove owner")
		return
	}

	if err := h.db.RemoveMember(r.Context(), id, targetUserID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove member")
		return
	}

	h.db.PublishEvent(r.Context(), "channel:events",
		`{"type":"channel.user_left","channelId":"`+id+`","userId":"`+targetUserID+`"}`)

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *ChannelHandler) MuteMember(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	targetUserID := chi.URLParam(r, "userId")
	requesterUserID := getUserID(r)
	requesterRole := getUserRole(r)

	var req model.MuteMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	member, err := h.db.GetChannelMember(r.Context(), id, requesterUserID)
	canManage := requesterRole == "admin" || (member != nil && (member.Role == "owner" || member.Role == "admin"))
	if !canManage {
		writeError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	targetMember, err := h.db.GetChannelMember(r.Context(), id, targetUserID)
	if err != nil {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	if targetMember.Role == "owner" {
		writeError(w, http.StatusForbidden, "cannot mute owner")
		return
	}

	if err := h.db.MuteMember(r.Context(), id, targetUserID, req.Muted); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mute member")
		return
	}

	eventType := "channel.user_muted"
	if !req.Muted {
		eventType = "channel.user_unmuted"
	}
	h.db.PublishEvent(r.Context(), "channel:events",
		`{"type":"`+eventType+`","channelId":"`+id+`","userId":"`+targetUserID+`"}`)

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "muted": req.Muted})
}

func (h *ChannelHandler) CreateSOS(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := getUserID(r)

	var req model.CreateSOSRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req.Message = ""
	}

	member, err := h.db.GetChannelMember(r.Context(), id, userID)
	if err != nil {
		writeError(w, http.StatusForbidden, "not a channel member")
		return
	}

	ch, err := h.db.GetChannel(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	alert, err := h.db.CreateSOSAlert(r.Context(), id, userID, req.Message)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create sos alert")
		return
	}

	sosEvent := map[string]interface{}{
		"type":        "sos.alert",
		"sosId":       alert.ID,
		"channelId":   id,
		"channelName": ch.Name,
		"userId":      userID,
		"displayName": member.DisplayName,
		"message":     req.Message,
		"createdAt":   alert.CreatedAt,
	}

	eventJSON, _ := json.Marshal(sosEvent)
	h.db.PublishEvent(r.Context(), "channel:events", string(eventJSON))
	h.db.PublishEvent(r.Context(), "sos:alerts", string(eventJSON))

	writeJSON(w, http.StatusCreated, map[string]interface{}{"sos": sosEvent})
}

func (h *ChannelHandler) ResolveSOS(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	sosID := chi.URLParam(r, "sosId")
	userID := getUserID(r)
	displayName := getUserDisplayName(r)

	if err := h.db.ResolveSOSAlert(r.Context(), sosID, id, userID); err != nil {
		writeError(w, http.StatusNotFound, "sos alert not found or already resolved")
		return
	}

	resolveEvent := map[string]interface{}{
		"type":          "sos.resolved",
		"sosId":         sosID,
		"channelId":     id,
		"resolvedBy":    userID,
		"resolvedByName": displayName,
	}

	eventJSON, _ := json.Marshal(resolveEvent)
	h.db.PublishEvent(r.Context(), "channel:events", string(eventJSON))

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "sosId": sosID})
}

func (h *ChannelHandler) ListSOS(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := getUserID(r)

	_, err := h.db.GetChannelMember(r.Context(), id, userID)
	if err != nil {
		writeError(w, http.StatusForbidden, "not a channel member")
		return
	}

	alerts, err := h.db.ListSOSAlerts(r.Context(), id)
	if err != nil {
		alerts = []model.SOSAlert{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"sosAlerts": alerts})
}

func (h *ChannelHandler) GetLocations(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := getUserID(r)

	_, err := h.db.GetChannelMember(r.Context(), id, userID)
	if err != nil {
		writeError(w, http.StatusForbidden, "not a channel member")
		return
	}

	locations, err := h.db.GetChannelLocations(r.Context(), id)
	if err != nil {
		locations = []model.UserLocation{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"locations": locations})
}
