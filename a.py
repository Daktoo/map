import html
import json
import re

def parse_html_desc(desc_html):
    extracted = {}
    if not desc_html or not isinstance(desc_html, str):
        return extracted
    img_match = re.search(r'<img [^>]*src=["\']([^"\']+)["\']', desc_html)
    if img_match:
        extracted["img"] = img_match.group(1)
    wiki_match = re.search(r'<a [^>]*href=["\']([^"\']+)["\'][^>]*>Wiki</a>', desc_html, re.IGNORECASE)
    if wiki_match:
        extracted["wiki"] = wiki_match.group(1)
    info_match = re.search(r'dial-info\\?">([^<]+)', desc_html, re.IGNORECASE)
    if info_match:
        extracted["info"] = html.unescape(info_match.group(1).strip())

    return extracted

def extract_type_from_set(set_key, set_val):
    raw_label = ""
    if isinstance(set_val, dict):
        raw_label = set_val.get("label", set_key)
    else:
        raw_label = str(set_key)

    # Search for text inside parentheses (e.g., 'Dial (Build)' -> 'build')
    paren_match = re.search(r"\(([^)]+)\)", raw_label)
    if paren_match:
        return paren_match.group(1).strip().lower()

    # Fallback to the raw label lowercased
    return raw_label.strip().lower()


def flatten_marker_data(old_data):
    sets_data = old_data.get("sets", {})
    flattened_markers = {}

    if isinstance(sets_data, dict):
        for set_key, set_val in sets_data.items():
            if not isinstance(set_val, dict):
                continue

            markers_dict = set_val.get("markers", {})
            if not isinstance(markers_dict, dict):
                continue

            # Determine type from the parent set
            set_type = extract_type_from_set(set_key, set_val)

            for marker_id, marker_info in markers_dict.items():
                if not isinstance(marker_info, dict):
                    continue

                new_marker = dict(marker_info)

                # Set type derived from the set layer
                new_marker["type"] = set_type

                # Process and clean the HTML desc field
                desc_html = new_marker.pop("desc", "")
                if desc_html:
                    extracted_props = parse_html_desc(desc_html)
                    new_marker.update(extracted_props)

                flattened_markers[marker_id] = new_marker

    flat_data = {
        "timestamp": old_data.get("timestamp", 0),
        "markers": flattened_markers,
    }

    return flat_data


def process_file(input_filepath, output_filepath):
    with open(input_filepath, "r", encoding="utf-8") as f:
        old_data = json.load(f)

    flat_data = flatten_marker_data(old_data)

    with open(output_filepath, "w", encoding="utf-8") as f:
        json.dump(flat_data, f, indent=2, ensure_ascii=False)

    print(f"Successfully converted {input_filepath} -> {output_filepath}")


if __name__ == "__main__":
    process_file("marker_world.json", "flat_marker_world.json")
