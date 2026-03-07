# Sidebar layout regression checklist

Use this after sidebar-related CSS changes:

1. Run `npm --prefix frontend run dev`.
2. Open `/dev/sidebar-layout`.
3. Verify both test widths (`360px` and `320px`) show:
   - no horizontal overflow,
   - no clipped buttons/inputs,
   - long device name/uid wrapped or ellipsized inside bounds.
4. In the main app, verify Device, Sessions, Playback, Coverage, and Debug tabs still render correctly in the sidebar.
