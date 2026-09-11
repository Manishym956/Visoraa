import { StyleSheet, Text, View } from "react-native";
import type { VisualSpec } from "./lessonView";
import { colors } from "./theme";

export function VisualSpecView({ visual }: { visual: VisualSpec }) {
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.kicker}>{visual.kind.replace(/_/g, " ")}</Text>
      <Text style={styles.title}>{visual.title}</Text>
      {visual.caption ? <Text style={styles.caption}>{visual.caption}</Text> : null}

      {visual.kind === "equation_breakdown" ? <EquationStrip visual={visual} /> : null}
      {visual.kind === "flowchart" ? <FlowRow visual={visual} /> : null}
      {visual.kind === "graph" ? <GraphAxes visual={visual} /> : null}
      {visual.kind === "concept_map" ? <ConceptCards visual={visual} /> : null}

      {visual.kind !== "equation_breakdown" &&
      visual.kind !== "flowchart" &&
      visual.kind !== "graph" &&
      visual.kind !== "concept_map"
        ? visual.nodes.map((node) => (
            <View key={node.id} style={styles.node}>
              <Text style={styles.nodeLabel}>{node.label}</Text>
              {node.detail ? <Text style={styles.nodeDetail}>{node.detail}</Text> : null}
            </View>
          ))
        : null}

      {visual.annotations && visual.annotations.length > 0 ? (
        <View style={styles.annoBlock}>
          <Text style={styles.kicker}>Annotations</Text>
          <View style={styles.overlay}>
            {visual.annotations.map((anno) => {
              const hasBox =
                anno.x != null && anno.y != null && anno.w != null && anno.h != null;
              return (
                <View
                  key={anno.id}
                  style={
                    hasBox
                      ? [
                          styles.annoBox,
                          {
                            left: `${(anno.x as number) * 100}%`,
                            top: `${(anno.y as number) * 100}%`,
                            width: `${(anno.w as number) * 100}%`,
                            height: `${(anno.h as number) * 100}%`,
                          },
                        ]
                      : styles.annoChip
                  }
                >
                  <Text style={styles.annoText}>{anno.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function EquationStrip({ visual }: { visual: VisualSpec }) {
  return (
    <View style={styles.strip}>
      {visual.nodes.map((node, index) => (
        <View key={node.id} style={styles.stripItem}>
          {index > 0 ? <Text style={styles.arrow}>→</Text> : null}
          <View style={styles.term}>
            <Text style={styles.termLabel}>{node.label}</Text>
            {node.detail ? <Text style={styles.nodeDetail}>{node.detail}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function FlowRow({ visual }: { visual: VisualSpec }) {
  return (
    <View style={styles.strip}>
      {visual.nodes.map((node, index) => (
        <View key={node.id} style={styles.stripItem}>
          {index > 0 ? <Text style={styles.arrow}>→</Text> : null}
          <View style={styles.flowBox}>
            <Text style={styles.termLabel}>{node.label}</Text>
            {node.detail ? <Text style={styles.nodeDetail}>{node.detail}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function GraphAxes({ visual }: { visual: VisualSpec }) {
  return (
    <View style={styles.graphWrap}>
      <View style={styles.yAxis} />
      <View style={styles.xAxis} />
      <View style={styles.slope} />
      {visual.nodes.map((node) => (
        <Text key={node.id} style={styles.graphLabel}>
          {node.label}
          {node.detail ? ` · ${node.detail}` : ""}
        </Text>
      ))}
    </View>
  );
}

function ConceptCards({ visual }: { visual: VisualSpec }) {
  return (
    <View style={styles.cardGrid}>
      {visual.nodes.map((node) => (
        <View key={node.id} style={styles.card}>
          <Text style={styles.termLabel}>{node.label}</Text>
          {node.detail ? <Text style={styles.nodeDetail}>{node.detail}</Text> : null}
        </View>
      ))}
      {visual.edges?.map((edge, index) => (
        <Text key={`${edge.from}-${edge.to}-${index}`} style={styles.edge}>
          {edge.from} → {edge.to}
          {edge.label ? ` (${edge.label})` : ""}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    padding: 16,
    gap: 12,
  },
  kicker: { color: colors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 },
  title: { color: colors.text, fontSize: 18, fontWeight: "600" },
  caption: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  node: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  nodeLabel: { color: colors.text, fontSize: 16, fontWeight: "600" },
  nodeDetail: { color: colors.muted, marginTop: 4, fontSize: 13 },
  edge: { color: colors.muted, fontSize: 13 },
  strip: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  stripItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  arrow: { color: colors.accent, fontSize: 18, fontWeight: "700" },
  term: {
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 72,
  },
  flowBox: {
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 88,
  },
  termLabel: { color: colors.text, fontSize: 16, fontWeight: "700" },
  graphWrap: {
    height: 160,
    borderWidth: 1,
    borderColor: colors.line,
    position: "relative",
    padding: 12,
    justifyContent: "flex-end",
    gap: 4,
  },
  yAxis: {
    position: "absolute",
    left: 24,
    top: 12,
    bottom: 24,
    width: 2,
    backgroundColor: colors.muted,
  },
  xAxis: {
    position: "absolute",
    left: 24,
    right: 12,
    bottom: 24,
    height: 2,
    backgroundColor: colors.muted,
  },
  slope: {
    position: "absolute",
    left: 40,
    bottom: 40,
    width: 120,
    height: 2,
    backgroundColor: colors.accent,
    transform: [{ rotate: "-28deg" }],
  },
  graphLabel: { color: colors.text, fontSize: 13, marginLeft: 32 },
  cardGrid: { gap: 8 },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  annoBlock: { gap: 8 },
  overlay: {
    height: 120,
    borderWidth: 1,
    borderColor: colors.line,
    position: "relative",
    backgroundColor: colors.bg,
  },
  annoBox: {
    position: "absolute",
    borderWidth: 1,
    borderColor: colors.accent,
    padding: 4,
    backgroundColor: "rgba(201, 242, 122, 0.12)",
  },
  annoChip: {
    borderWidth: 1,
    borderColor: colors.line,
    padding: 6,
    margin: 4,
    alignSelf: "flex-start",
  },
  annoText: { color: colors.accent, fontSize: 11, fontWeight: "600" },
});
