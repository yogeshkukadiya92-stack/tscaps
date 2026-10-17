#!/usr/bin/env bash
set -euo pipefail

# trim.sh — Trim video by start/end timestamps
#
# Usage: ./trim.sh <input_video> [options]
#
# Options:
#   --start <timestamp>  Start time (default: 00:00:00) — format: HH:MM:SS or seconds
#   --end <timestamp>    End time (default: end of video) — format: HH:MM:SS or seconds
#   --duration <time>    Duration from start (alternative to --end)
#   --output <path>      Output path (default: <input>_trimmed.<ext>)
#   --precise            Re-encode instead of stream copy (frame-accurate)
#
# Examples:
#   ./trim.sh video.mp4 --start 00:01:30 --end 00:05:00
#   ./trim.sh video.mp4 --start 10 --duration 60
#   ./trim.sh video.mp4 --start 00:00:30 --output clip.mp4

print_usage() {
    sed -n '3,14p' "$0" | sed 's/^# \?//'
}

if [[ $# -lt 1 ]]; then
    print_usage
    exit 1
fi

INPUT_VIDEO="$1"
shift

START=""
END=""
DURATION=""
OUTPUT=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --start)
            START="$2"
            shift 2
            ;;
        --end)
            END="$2"
            shift 2
            ;;
        --duration)
            DURATION="$2"
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

if [[ -z "$START" && -z "$END" && -z "$DURATION" ]]; then
    echo "Error: Specify at least --start, --end, or --duration"
    print_usage
    exit 1
fi

INPUT_DIR="$(dirname "$INPUT_VIDEO")"
INPUT_BASENAME="$(basename "$INPUT_VIDEO" | sed 's/\.[^.]*$//')"
INPUT_EXT="$(basename "$INPUT_VIDEO" | sed 's/.*\.//')"

if [[ -z "$OUTPUT" ]]; then
    OUTPUT="${INPUT_DIR}/${INPUT_BASENAME}_trimmed.${INPUT_EXT}"
fi


# --- stream safety -----------------------------------------------------------
# -c copy can only cut on keyframes. If the requested range contains no keyframe
# at all, ffmpeg produces a file with NO VIDEO TRACK and no error. So: try the
# fast copy, verify the result, and re-encode if the video is gone.
ENC_ARGS=(-c copy -avoid_negative_ts make_zero)
set_reencode() {
    ENC_ARGS=(-c:v libx264 -crf 18 -preset veryfast -c:a aac -avoid_negative_ts make_zero)
}
has_video_stream() {
    [[ -n "$(ffprobe -v error -select_streams v:0 -show_entries stream=index \
        -of csv=p=0 "$1" 2>/dev/null)" ]]
}
INPUT_HAS_VIDEO=""
if has_video_stream "$INPUT_VIDEO"; then INPUT_HAS_VIDEO=1; fi
if [[ "${PRECISE:-}" == "1" ]]; then set_reencode; fi
# ---------------------------------------------------------------------------

run_trim() {
    local args=(-y -i "$INPUT_VIDEO")
    if [[ -n "$START" ]]; then args+=(-ss "$START"); fi
    if [[ -n "$END" ]]; then
        args+=(-to "$END")
    elif [[ -n "$DURATION" ]]; then
        args+=(-t "$DURATION")
    fi
    args+=("${ENC_ARGS[@]}" "$OUTPUT")
    ffmpeg "${args[@]}" 2>&1 | tail -3
}

echo "Trimming video"
echo "Input: $INPUT_VIDEO"
echo "Start: ${START:-beginning}"
echo "End: ${END:-${DURATION:+${START:-0}+${DURATION}}}"

run_trim

if [[ -n "$INPUT_HAS_VIDEO" ]] && ! has_video_stream "$OUTPUT"; then
    echo "Video track did not survive stream copy (no keyframe in range) — re-encoding"
    set_reencode
    run_trim
fi

if [[ -n "$INPUT_HAS_VIDEO" ]] && ! has_video_stream "$OUTPUT"; then
    echo "Error: the result has no video track" >&2
    exit 1
fi

echo "Output: $OUTPUT"
