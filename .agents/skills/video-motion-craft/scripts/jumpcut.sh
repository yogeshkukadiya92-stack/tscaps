#!/usr/bin/env bash
set -euo pipefail

# jumpcut.sh — Auto-remove silence/dead air from video using ffmpeg silencedetect
#
# Usage: ./jumpcut.sh <input_video> [options]
#
# Options:
#   --threshold <dB>     Silence threshold in dB (default: -30)
#   --duration <sec>     Minimum silence duration to cut, in seconds (default: 0.5)
#   --padding <sec>      Padding to keep around speech, in seconds (default: 0.1)
#   --output <path>      Output path (default: <input>_jumpcut.<ext>)
#   --precise            Re-encode segments instead of stream copy
#
# Examples:
#   ./jumpcut.sh video.mp4
#   ./jumpcut.sh video.mp4 --threshold -35 --duration 0.8
#   ./jumpcut.sh video.mp4 --padding 0.15 --output edited.mp4

print_usage() {
    sed -n '3,14p' "$0" | sed 's/^# \?//'
}

if [[ $# -lt 1 ]]; then
    print_usage
    exit 1
fi

INPUT_VIDEO="$1"
shift

THRESHOLD="-30"
MIN_SILENCE="0.5"
PADDING="0.1"
OUTPUT=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --threshold)
            THRESHOLD="$2"
            shift 2
            ;;
        --duration)
            MIN_SILENCE="$2"
            shift 2
            ;;
        --padding)
            PADDING="$2"
            shift 2
            ;;
        --output)
            OUTPUT="$2"
            shift 2
            ;;
        --precise)
            PRECISE=1
            shift
            ;;
        *)
            echo "Error: Unknown option '$1'"
            print_usage
            exit 1
            ;;
    esac
done

if [[ ! -f "$INPUT_VIDEO" ]]; then
    echo "Error: Input video not found: $INPUT_VIDEO"
    exit 1
fi

INPUT_DIR="$(dirname "$INPUT_VIDEO")"
INPUT_BASENAME="$(basename "$INPUT_VIDEO" | sed 's/\.[^.]*$//')"
INPUT_EXT="$(basename "$INPUT_VIDEO" | sed 's/.*\.//')"

if [[ -z "$OUTPUT" ]]; then
    OUTPUT="${INPUT_DIR}/${INPUT_BASENAME}_jumpcut.${INPUT_EXT}"
fi


# --- stream safety -----------------------------------------------------------
# -c copy can only cut on keyframes: if a segment contains none, ffmpeg produces
# a file with NO VIDEO TRACK. Check the first segment and, if the video is lost,
# switch the whole pass to re-encoding.
ENC_ARGS=(-c copy -avoid_negative_ts make_zero)
set_reencode() {
    ENC_ARGS=(-c:v libx264 -crf 18 -preset veryfast -c:a aac -avoid_negative_ts make_zero)
}
has_video_stream() {
    [[ -n "$(ffprobe -v error -select_streams v:0 -show_entries stream=index \
        -of csv=p=0 "$1" 2>/dev/null)" ]]
}
extract_segment() {   # $1 output, $2 start, [$3 end]
    local out="$1" ss="$2" to="${3:-}"
    local args=(-y -i "$INPUT_VIDEO" -ss "$ss")
    if [[ -n "$to" ]]; then args+=(-to "$to"); fi
    args+=("${ENC_ARGS[@]}" "$out")
    ffmpeg "${args[@]}" 2>/dev/null
}
INPUT_HAS_VIDEO=""
if has_video_stream "$INPUT_VIDEO"; then INPUT_HAS_VIDEO=1; fi
FALLBACK_CHECKED=""
if [[ "${PRECISE:-}" == "1" ]]; then set_reencode; FALLBACK_CHECKED=1; fi
check_fallback() {   # $1 the segment just produced, $2 start, [$3 end]
    if [[ -n "$INPUT_HAS_VIDEO" && -z "$FALLBACK_CHECKED" ]]; then
        FALLBACK_CHECKED=1
        if ! has_video_stream "$1"; then
            echo "Video track did not survive stream copy (sparse keyframes) — re-encoding segments"
            set_reencode
            extract_segment "$1" "$2" "${3:-}"
        fi
    fi
}
# ---------------------------------------------------------------------------

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "Detecting silence..."
echo "Threshold: ${THRESHOLD}dB, Min duration: ${MIN_SILENCE}s, Padding: ${PADDING}s"

# Detect silence periods
SILENCE_LOG="${TEMP_DIR}/silence.log"
ffmpeg -i "$INPUT_VIDEO" \
    -af "silencedetect=noise=${THRESHOLD}dB:d=${MIN_SILENCE}" \
    -f null - 2>&1 | grep -E "silence_(start|end)" > "$SILENCE_LOG" || true

if [[ ! -s "$SILENCE_LOG" ]]; then
    echo "No silence detected — copying input as-is"
    cp "$INPUT_VIDEO" "$OUTPUT"
    echo "Output: $OUTPUT"
    exit 0
fi

# Parse silence periods into start/end pairs
SILENCE_STARTS=()
SILENCE_ENDS=()

while IFS= read -r line; do
    if [[ "$line" =~ silence_start:\ ([0-9.]+) ]]; then
        SILENCE_STARTS+=("${BASH_REMATCH[1]}")
    elif [[ "$line" =~ silence_end:\ ([0-9.]+) ]]; then
        SILENCE_ENDS+=("${BASH_REMATCH[1]}")
    fi
done < "$SILENCE_LOG"

# Get video duration
VIDEO_DURATION="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$INPUT_VIDEO")"

echo "Found ${#SILENCE_STARTS[@]} silence periods in ${VIDEO_DURATION}s video"

# Build non-silent segments
SEGMENTS_FILE="${TEMP_DIR}/segments.txt"
SEGMENT_LIST="${TEMP_DIR}/concat.txt"
SEGMENT_COUNT=0

# Helper: compare floats
float_lt() {
    awk "BEGIN { exit !($1 < $2) }"
}

float_add() {
    awk "BEGIN { printf \"%.6f\", $1 + $2 }"
}

float_sub() {
    awk "BEGIN { v = $1 - $2; printf \"%.6f\", (v < 0 ? 0 : v) }"
}

CURRENT_POS="0"

for i in "${!SILENCE_STARTS[@]}"; do
    SILENCE_START="${SILENCE_STARTS[$i]}"
    SILENCE_END="${SILENCE_ENDS[$i]:-$VIDEO_DURATION}"

    # Segment ends at silence start + padding
    SEG_END="$(float_add "$SILENCE_START" "$PADDING")"
    # Next segment starts at silence end - padding
    NEXT_START="$(float_sub "$SILENCE_END" "$PADDING")"

    if float_lt "$CURRENT_POS" "$SEG_END"; then
        SEGMENT_FILE="${TEMP_DIR}/seg_${SEGMENT_COUNT}.${INPUT_EXT}"
        extract_segment "$SEGMENT_FILE" "$CURRENT_POS" "$SEG_END"
        check_fallback "$SEGMENT_FILE" "$CURRENT_POS" "$SEG_END"

        if [[ -f "$SEGMENT_FILE" && "$(stat -f%z "$SEGMENT_FILE" 2>/dev/null || stat -c%s "$SEGMENT_FILE" 2>/dev/null)" -gt 0 ]]; then
            echo "file '${SEGMENT_FILE}'" >> "$SEGMENT_LIST"
            SEGMENT_COUNT=$((SEGMENT_COUNT + 1))
        fi
    fi

    CURRENT_POS="$NEXT_START"
done

# Add final segment (after last silence to end of video)
if float_lt "$CURRENT_POS" "$VIDEO_DURATION"; then
    SEGMENT_FILE="${TEMP_DIR}/seg_${SEGMENT_COUNT}.${INPUT_EXT}"
    extract_segment "$SEGMENT_FILE" "$CURRENT_POS"
    check_fallback "$SEGMENT_FILE" "$CURRENT_POS"

    if [[ -f "$SEGMENT_FILE" && "$(stat -f%z "$SEGMENT_FILE" 2>/dev/null || stat -c%s "$SEGMENT_FILE" 2>/dev/null)" -gt 0 ]]; then
        echo "file '${SEGMENT_FILE}'" >> "$SEGMENT_LIST"
        SEGMENT_COUNT=$((SEGMENT_COUNT + 1))
    fi
fi

if [[ $SEGMENT_COUNT -eq 0 ]]; then
    echo "Error: No non-silent segments found"
    exit 1
fi

echo "Concatenating $SEGMENT_COUNT segments..."

ffmpeg -y -f concat -safe 0 -i "$SEGMENT_LIST" \
    -c copy "$OUTPUT" 2>&1 | tail -3

# Report savings
OUTPUT_DURATION="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTPUT")"
SAVED="$(awk "BEGIN { printf \"%.1f\", $VIDEO_DURATION - $OUTPUT_DURATION }")"
PERCENT="$(awk "BEGIN { printf \"%.0f\", ($VIDEO_DURATION - $OUTPUT_DURATION) / $VIDEO_DURATION * 100 }")"

if [[ -n "$INPUT_HAS_VIDEO" ]] && ! has_video_stream "$OUTPUT"; then
    echo "Error: the result has no video track — rerun with --precise" >&2
    exit 1
fi

echo "Output: $OUTPUT"
echo "Original: ${VIDEO_DURATION}s → Edited: ${OUTPUT_DURATION}s (removed ${SAVED}s / ${PERCENT}%)"
