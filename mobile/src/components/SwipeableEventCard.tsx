import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Icon } from './Icon';
import { EventCard } from './EventCard';
import type { EventCardProps } from './EventCard';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

interface SwipeableEventCardProps extends EventCardProps {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
}

export function SwipeableEventCard({
  onSwipeRight,
  onSwipeLeft,
  ...eventCardProps
}: SwipeableEventCardProps) {
  const translateX = useSharedValue(0);
  const cardHeight = useSharedValue<number | undefined>(undefined);

  const handleSwipeRight = useCallback(() => {
    onSwipeRight?.();
  }, [onSwipeRight]);

  const handleSwipeLeft = useCallback(() => {
    onSwipeLeft?.();
  }, [onSwipeLeft]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD && onSwipeRight) {
        // Swipe right → add to calendar
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 250 }, () => {
          cardHeight.value = withTiming(0, { duration: 200 }, () => {
            runOnJS(handleSwipeRight)();
          });
        });
      } else if (e.translationX < -SWIPE_THRESHOLD && onSwipeLeft) {
        // Swipe left → delete
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 250 }, () => {
          cardHeight.value = withTiming(0, { duration: 200 }, () => {
            runOnJS(handleSwipeLeft)();
          });
        });
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => {
    if (cardHeight.value === undefined) return {};
    return {
      height: cardHeight.value,
      marginBottom: cardHeight.value === 0 ? 0 : 12,
      overflow: 'hidden' as const,
    };
  });

  // Right action background (add to calendar) - revealed when swiping right
  const rightActionStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD],
      [0, 0.6, 1],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0.5, 1],
      Extrapolation.CLAMP
    );
    return { opacity, transform: [{ scale }] };
  });

  // Left action background (delete) - revealed when swiping left
  const leftActionStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, -SWIPE_THRESHOLD * 0.5, 0],
      [1, 0.6, 0],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0.5],
      Extrapolation.CLAMP
    );
    return { opacity, transform: [{ scale }] };
  });

  return (
    <Animated.View style={containerAnimatedStyle}>
      {/* Background actions */}
      <View style={styles.actionsContainer}>
        {/* Right swipe action (add to calendar) */}
        <Animated.View style={[styles.actionRight, rightActionStyle]}>
          <View style={styles.actionContentRight}>
            <Icon name="CalendarStar" size={28} color="#ffffff" weight="duotone" />
            <Text style={styles.actionText}>Add</Text>
          </View>
        </Animated.View>

        {/* Left swipe action (delete) */}
        <Animated.View style={[styles.actionLeft, leftActionStyle]}>
          <View style={styles.actionContentLeft}>
            <Icon name="X" size={28} color="#ffffff" weight="bold" />
            <Text style={styles.actionText}>Remove</Text>
          </View>
        </Animated.View>
      </View>

      {/* Foreground card */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={cardAnimatedStyle}>
          <EventCard {...eventCardProps} />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  actionsContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionRight: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 12,
    width: '50%',
    backgroundColor: '#10B981',
    borderRadius: 16,
    justifyContent: 'center',
  },
  actionContentRight: {
    alignItems: 'center',
    paddingLeft: 32,
    gap: 4,
  },
  actionLeft: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 12,
    width: '50%',
    backgroundColor: '#EF4444',
    borderRadius: 16,
    justifyContent: 'center',
  },
  actionContentLeft: {
    alignItems: 'center',
    paddingRight: 32,
    alignSelf: 'flex-end',
    gap: 4,
  },
  actionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
