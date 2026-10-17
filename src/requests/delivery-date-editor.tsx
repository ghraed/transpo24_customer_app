import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { calendarDay, scheduleBounds } from "./schedule-rules";

export function DeliveryDateEditor({
  pickup,
  furniture = false,
  value,
  onChange,
}: {
  pickup: Date;
  furniture?: boolean;
  value?: Date;
  onChange: (date: Date) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Date>();
  const { minimum, maximum } = scheduleBounds(pickup, new Date(), furniture);
  const available = minimum.getTime() <= maximum.getTime();
  const selected =
    value && calendarDay(value) >= minimum && calendarDay(value) <= maximum
      ? value
      : minimum;
  const save = (date: Date) => {
    const result = new Date(date);
    result.setHours(12, 0, 0, 0);
    onChange(result);
    setOpen(false);
  };
  const picker =
    open && available ? (
      <DateTimePicker
        value={pending ?? selected}
        mode="date"
        display="spinner"
        minimumDate={minimum}
        maximumDate={maximum}
        themeVariant="light"
        onChange={(event, date) => {
          if (Platform.OS === "android") {
            setOpen(false);
            if (event.type === "set" && date) save(date);
          } else if (date) setPending(date);
        }}
      />
    ) : null;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t("Delivery Date")}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("Delivery Date")}
        accessibilityState={{ disabled: !available }}
        disabled={!available}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
        onPress={() => {
          setPending(selected);
          setOpen(true);
        }}
      >
        <Text style={styles.text}>
          {value ? value.toLocaleDateString() : t("Select delivery date")}
        </Text>
      </Pressable>
      <Text style={styles.hint}>
        {t(
          available
            ? furniture
              ? "Furniture delivery must be on pickup day or within five days after pickup."
              : "Delivery must be after pickup and within today through five days ahead."
            : "No delivery dates available. Choose an earlier pickup date.",
        )}
      </Text>
      {Platform.OS === "ios" ? (
        <Modal
          transparent
          visible={open && available}
          onRequestClose={() => setOpen(false)}
        >
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              {picker}
              <View style={styles.actions}>
                <Pressable style={styles.action} onPress={() => setOpen(false)}>
                  <Text>{t("Cancel")}</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={() => save(pending ?? selected)}
                >
                  <Text>{t("Save")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : (
        picker
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { gap: 8, marginVertical: 12 },
  label: { fontSize: 14, fontWeight: "700", color: "#111827" },
  text: { fontSize: 15, color: "#111827" },
  hint: { fontSize: 13, color: "#68768A" },
  button: {
    minHeight: 48,
    padding: 14,
    borderWidth: 1,
    borderColor: "#D9DFE8",
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#0006",
  },
  sheet: { backgroundColor: "#FFF", padding: 20, borderRadius: 16 },
  actions: { flexDirection: "row", justifyContent: "space-between" },
  action: { minHeight: 48, padding: 14 },
});
